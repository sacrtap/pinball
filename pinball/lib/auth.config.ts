import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

/**
 * Middleware 专用轻量配置（无 Prisma / argon2 / OAuth 密钥依赖，
 * 兼容 edge runtime）。只做未认证粗拦截；完整配置见 lib/auth/config.ts。
 */
export const { auth } = NextAuth({
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: () => null,
    }),
  ],
  session: { strategy: 'jwt' },
  trustHost: true,
  pages: { signIn: '/login' },
});
