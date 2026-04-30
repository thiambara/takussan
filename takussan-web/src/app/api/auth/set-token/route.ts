import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { NextRequest, NextResponse } from 'next/server';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { token } = await request.json();
  const response = NextResponse.json({ ok: true });

  if (!token) {
    response.cookies.delete(AUTH_COOKIE_NAME);
    return response;
  }

  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });

  return response;
}
