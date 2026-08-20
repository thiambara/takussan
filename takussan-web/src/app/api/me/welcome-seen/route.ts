import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { ApiError, apiRequest } from '@/lib/api';
import type { WelcomeSeenListResponse, WelcomeSeenStoreResponse } from '@/types/welcome-view';

/**
 * TCK-251 — Welcome modale tracking proxy.
 *
 * GET  → returns the keys the current user has already acknowledged.
 * POST → marks `{ key }` as seen for the current user (idempotent).
 *
 * Auth is read from the HttpOnly cookie. The Laravel backend re-authorises
 * via Sanctum; this proxy only forwards the bearer.
 */

async function readToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_COOKIE_NAME)?.value ?? null;
}

export async function GET(): Promise<NextResponse> {
  const token = await readToken();
  if (!token) return NextResponse.json(null, { status: 401 });

  try {
    const data = await apiRequest<WelcomeSeenListResponse>('/api/me/welcome-seen', { token });
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(err.data, { status: err.status });
    }
    console.error('[BFF] Failed to load welcome views.', err);
    return NextResponse.json({ code: 'server_error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = await readToken();
  if (!token) return NextResponse.json(null, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: 'invalid_json_body' }, { status: 400 });
  }

  try {
    const data = await apiRequest<WelcomeSeenStoreResponse>('/api/me/welcome-seen', {
      method: 'POST',
      token,
      body,
    });
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(err.data, { status: err.status });
    }
    console.error('[BFF] Failed to mark welcome as seen.', err);
    return NextResponse.json({ code: 'server_error' }, { status: 500 });
  }
}
