import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/db/prisma';
import { withTenant } from '@/lib/db/tenant';
import { verifyPassword } from '@/lib/auth/password';
import { loginRateLimit } from '@/lib/rate-limit';
import { getTenantIdForUser } from '@/lib/auth/tenant-resolve';
import type { Provider } from 'next-auth/providers';

/** JWT/session 扩展字段类型声明（替代内联 cast） */
declare module 'next-auth' {
  interface Session {
    userId?: string;
    tenantId?: string;
  }
}



/**
 * Auth.js v5 配置。
 * - session.strategy='jwt'：JWT 携带 userId + tenantId。
 * - callbacks.authorized 仅做未认证粗拦截（路由级），对象级授权下沉数据层（RLS + withTenant）。
 * - OAuth 凭据留空时 provider 不启用（代码就位，不阻塞邮箱登录）。
 */
const providers: Provider[] = [
  Credentials({
    credentials: {
      email: { label: '邮箱', type: 'email' },
      password: { label: '密码', type: 'password' },
    },
    async authorize(credentials) {
      const email = String(credentials?.email ?? '').trim().toLowerCase();
      const password = String(credentials?.password ?? '');
      if (!email || !password) return null;

      // 登录限流（防暴力破解）
      const rl = await loginRateLimit(email);
      if (!rl.ok) return null;

      const user = await prisma.user.findUnique({ where: { email } });
      // 用户不存在或密码为空（OAuth 账号）→ null
      if (!user?.passwordHash) return null;
      if (!(await verifyPassword(user.passwordHash, password))) return null;

      // 审计登录成功（独立事务，失败不影响登录）
      // AuditLog 启用了 FORCE ROW LEVEL SECURITY，必须经 withTenant 设置
      // app.current_tenant 才能写入；直连 prisma 会被 policy 拦下。
      const membership = await prisma.membership.findFirst({ where: { userId: user.id } });
      if (membership) {
        await withTenant(membership.tenantId, (tx) =>
          tx.auditLog.create({
            data: { tenantId: membership.tenantId, userId: user.id, action: 'login' },
          }),
        ).catch(() => {});
      }
      return { id: user.id, email: user.email };
    },
  }),
];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  providers.push(
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers,
  session: { strategy: 'jwt' },
  trustHost: true,
  pages: { signIn: '/login' },
  callbacks: {
    async signIn({ user, account }) {
      // OAuth 首次登录：确保有默认个人租户
      if (account?.provider !== 'credentials' && user.id) {
        const tenantId = await getTenantIdForUser(user.id);
        if (!tenantId) {
          await prisma.$transaction(async (tx) => {
            const tenant = await tx.tenant.create({
              data: { name: `${user.email ?? '个人'} 的个人空间` },
            });
            await tx.membership.create({
              data: { tenantId: tenant.id, userId: user.id!, role: 'owner' },
            });
          });
        }
      }
      return true;
    },
    async jwt({ token, user, trigger, session: updateData }) {
      // JWT 经 Record<string, unknown> 索引，扩展字段运行时校验类型
      const raw = token as Record<string, unknown>;
      if (user?.id) raw.userId = user.id;
      // 租户切换：客户端 update({ tenantId }) 触发
      if (trigger === 'update') {
        const next = (updateData as { tenantId?: unknown } | undefined)?.tenantId;
        if (typeof next === 'string') raw.tenantId = next;
        return token;
      }
      // 登录时或 token 尚无 tenantId 时解析并注入
      const userId = typeof raw.userId === 'string' ? raw.userId : user?.id;
      const hasTenant = typeof raw.tenantId === 'string';
      if (userId && (user?.id || !hasTenant)) {
        const tenantId = await getTenantIdForUser(userId);
        if (tenantId) raw.tenantId = tenantId;
      }
      return token;
    },
    session({ session, token }) {
      const raw = token as Record<string, unknown>;
      if (typeof raw.userId === 'string') session.userId = raw.userId;
      if (typeof raw.tenantId === 'string') session.tenantId = raw.tenantId;
      return session;
    },
    // 仅粗粒度未认证拦截；对象级授权在数据层
    authorized({ auth: session }) {
      return !!session;
    },
  },
});
