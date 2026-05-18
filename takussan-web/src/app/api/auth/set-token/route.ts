import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { ACTIVE_PROFILE_COOKIE } from '@/lib/profiles';
import { NextRequest, NextResponse } from 'next/server';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { token } = await request.json();
  const response = NextResponse.json({ ok: true });

  // The active-profile cookie is bound to a specific user session. A fresh
  // login can land on a different user (or a re-seeded DB where the previous
  // profile id no longer resolves) — clear it on every set-token call so the
  // resolver re-derives the scope on the next request.
  response.cookies.delete(ACTIVE_PROFILE_COOKIE);

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
