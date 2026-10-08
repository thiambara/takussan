import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';

import { maxAgeDepuis } from '@/app/api/auth/set-token/route';
import { IMPERSONATION_COOKIE, IMPERSONATION_MARKER_COOKIE } from '@/lib/impersonation';

/**
 * TCK-600 (ADR-0055 §6) — les cookies de la session d'impersonation, posés et effacés par les seuls
 * route handlers de `src/app/api/impersonation/`.
 *
 * Le jeton : httpOnly, `SameSite=Strict`, `Secure` en production, durée dérivée d'`expires_at`
 * (15 minutes au plus). Le témoin : mêmes bornes, lisible par la page — il ne porte que `1`.
 */
export function poserLaSession(reponse: NextResponse, jeton: string, expiresAt: string): void {
  const commun = {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: maxAgeDepuis(expiresAt),
  };
  reponse.cookies.set(IMPERSONATION_COOKIE, jeton, { ...commun, httpOnly: true });
  reponse.cookies.set(IMPERSONATION_MARKER_COOKIE, '1', { ...commun, httpOnly: false });
}

export function effacerLaSession(reponse: NextResponse): void {
  reponse.cookies.delete(IMPERSONATION_COOKIE);
  reponse.cookies.delete(IMPERSONATION_MARKER_COOKIE);
}

export async function jetonDImpersonation(): Promise<string | undefined> {
  return (await cookies()).get(IMPERSONATION_COOKIE)?.value;
}
