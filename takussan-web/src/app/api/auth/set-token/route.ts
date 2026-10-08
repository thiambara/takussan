import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { ACTIVE_PROFILE_COOKIE } from '@/lib/profiles';
import { NextRequest, NextResponse } from 'next/server';

/** Repli quand l'API ne dit pas quand le jeton expire (jeton d'avant TCK-589). */
const COOKIE_MAX_AGE_REPLI = 60 * 60 * 24 * 7; // 7 days

/**
 * TCK-589 — le cookie ne survit jamais au jeton : son `maxAge` est dérivé de `expires_at`
 * (rendu par la connexion, l'inscription, le téléphone et OAuth). Il vivait 7 jours fixes,
 * quel que soit le jeton — une session super-admin de 8 h gardait un cookie mort 7 jours.
 */
export function maxAgeDepuis(expiresAt: unknown, maintenant: number = Date.now()): number {
  if (typeof expiresAt !== 'string' || expiresAt === '') return COOKIE_MAX_AGE_REPLI;
  const fin = Date.parse(expiresAt);
  if (Number.isNaN(fin)) return COOKIE_MAX_AGE_REPLI;
  return Math.max(0, Math.floor((fin - maintenant) / 1000));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { token, expires_at: expiresAt } = await request.json();
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
    maxAge: maxAgeDepuis(expiresAt),
  });

  return response;
}
