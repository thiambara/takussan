import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { ApiError } from '@/lib/api';
import { fetchMyWizardDrafts } from '@/lib/wizard-drafts';

/**
 * TCK-250 — GET /api/me/wizard-drafts (Next proxy).
 *
 * Reads the auth cookie and forwards to the Laravel backend so the dashboard
 * banner can list active drafts without exposing the bearer token to the
 * client bundle.
 */
export async function GET(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json(null, { status: 401 });

  try {
    const data = await fetchMyWizardDrafts(token);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(err.data, { status: err.status });
    }
    console.error('[BFF] Failed to load wizard drafts.', err);
    return NextResponse.json({ code: 'server_error' }, { status: 500 });
  }
}
