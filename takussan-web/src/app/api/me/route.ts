import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { ApiError, apiRequest } from '@/lib/api';
import type { User } from '@/types/user';

/**
 * TCK-253 — Partial update proxy for the authenticated user's
 * personalisation fields. Exposed via PATCH so callers (the deferred
 * minimal-profile sheet, future preferences UIs) can submit only the
 * fields they touch.
 *
 * Auth is read from the HttpOnly cookie; the Laravel backend re-authorises
 * via Sanctum.
 */

async function readToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_COOKIE_NAME)?.value ?? null;
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const token = await readToken();
  if (!token) return NextResponse.json(null, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body.' }, { status: 400 });
  }

  try {
    const data = await apiRequest<{ data: User }>('/api/me', {
      method: 'PATCH',
      token,
      body,
    });
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(err.data, { status: err.status });
    }
    return NextResponse.json({ message: 'Failed to update profile.' }, { status: 500 });
  }
}
