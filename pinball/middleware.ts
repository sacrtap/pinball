import { auth } from '@/lib/auth.config';

// 仅粗粒度未认证拦截，非安全边界；对象级授权在数据层（RLS + withTenant）
export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const isAuthPage = nextUrl.pathname.startsWith('/login') || nextUrl.pathname.startsWith('/register');
  if (isAuthPage) return undefined; // 放行登录/注册
  if (!isLoggedIn) {
    return Response.redirect(new URL('/login', nextUrl));
  }
  return undefined;
});

export const config = {
  matcher: [
    '/((?!login|register|api/auth|api/test|_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
