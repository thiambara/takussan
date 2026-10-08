import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { IMPERSONATION_COOKIE, IMPERSONATION_MARKER_COOKIE } from '@/lib/impersonation';
import { ACTIVE_PROFILE_COOKIE } from '@/lib/profiles';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

// Called when a Server Component detects a 401 from the API. RSC render
// cannot mutate cookies; redirecting here moves cleanup into a Route
// Handler, which can.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies();
  // TCK-600 (ADR-0055 §6) — c'est la session d'impersonation qui a expiré, pas celle de
  // l'opérateur : on n'efface qu'elle, et l'opérateur revient à la console.
  if (cookieStore.get(IMPERSONATION_COOKIE)?.value) {
    cookieStore.delete(IMPERSONATION_COOKIE);
    cookieStore.delete(IMPERSONATION_MARKER_COOKIE);
    return NextResponse.redirect(new URL('/super-admin/users', request.url));
  }
  cookieStore.delete(AUTH_COOKIE_NAME);
  cookieStore.delete(ACTIVE_PROFILE_COOKIE);
  return NextResponse.redirect(new URL('/auth/login', request.url));
}
