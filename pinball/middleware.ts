import { auth } from '@/lib/auth.config';

// 仅粗粒度未认证拦截，非安全边界；对象级授权在数据层（RLS + withTenant）
export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const isAuthPage = nextUrl.pathname.startsWith('/login') || nextUrl.pathname.startsWith('/register');
  if (isAuthPage) return undefined; // 放行登录/注册
  if (!isLoggedIn) {
    // API 路径返回 401 而非重定向（语义正确，客户端可据此跳登录）
    if (nextUrl.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: '未认证' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return Response.redirect(new URL('/login', nextUrl));
  }
  return undefined;
});

export const config = {
  matcher: [
    '/((?!login|register|api/auth|api/test|_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
