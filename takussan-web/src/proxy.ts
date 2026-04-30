import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  const isAuthPath = pathname.startsWith('/auth');
  const isAppPath = pathname.startsWith('/app') || pathname.startsWith('/admin');

  if (isAppPath && !token) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPath && token) {
    return NextResponse.redirect(new URL('/app', request.url));
  }

  return NextResponse.next();
}

export const proxyConfig = {
  matcher: ['/app/:path*', '/admin/:path*', '/auth/:path*'],
};
