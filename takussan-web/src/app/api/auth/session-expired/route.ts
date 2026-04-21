import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

// Called when a Server Component detects a 401 from the API. RSC render
// cannot mutate cookies; redirecting here moves cleanup into a Route
// Handler, which can.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
  return NextResponse.redirect(new URL('/auth/login', request.url));
}
