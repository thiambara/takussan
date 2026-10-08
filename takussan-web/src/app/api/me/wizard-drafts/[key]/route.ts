import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { ApiError, apiRequest } from '@/lib/api';
import { jetonEspaceApplicatif } from '@/lib/impersonation';
import { reponseSegmentInvalide, segmentAmont } from '@/lib/segments-amont';

/**
 * TCK-250 — Per-key wizard-draft proxy.
 *
 * GET    → fetch the user's draft for `{key}` (404 = no draft yet).
 * PUT    → upsert `{ step: int, data: object }`.
 * DELETE → clear the draft (idempotent — 204 even when missing).
 *
 * Auth is read from the HttpOnly cookie. The Laravel backend re-authorises
 * via Sanctum; this proxy only forwards the bearer.
 */

type Params = Promise<{ key: string }>;

async function readToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return jetonEspaceApplicatif(cookieStore) ?? null;
}

function buildPath(key: string): string {
  // `key` sort de `segmentAmont()` : déjà ré-encodé, et jamais `.`, `..` ni porteur de `/`.
  return `/api/me/wizard-drafts/${key}`;
}

export async function GET(_req: NextRequest, ctx: { params: Params }): Promise<NextResponse> {
  const token = await readToken();
  if (!token) return NextResponse.json(null, { status: 401 });
  const key = segmentAmont((await ctx.params).key);
  if (key === null) return reponseSegmentInvalide();

  try {
    const data = await apiRequest<unknown>(buildPath(key), { token });
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(err.data, { status: err.status });
    }
    console.error('[BFF] Failed to load draft.', err);
    return NextResponse.json({ code: 'server_error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, ctx: { params: Params }): Promise<NextResponse> {
  const token = await readToken();
  if (!token) return NextResponse.json(null, { status: 401 });
  const key = segmentAmont((await ctx.params).key);
  if (key === null) return reponseSegmentInvalide();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: 'invalid_json_body' }, { status: 400 });
  }

  try {
    const data = await apiRequest<unknown>(buildPath(key), {
      method: 'PUT',
      token,
      body,
    });
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(err.data, { status: err.status });
    }
    console.error('[BFF] Failed to save draft.', err);
    return NextResponse.json({ code: 'server_error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Params }): Promise<NextResponse> {
  const token = await readToken();
  if (!token) return NextResponse.json(null, { status: 401 });
  const key = segmentAmont((await ctx.params).key);
  if (key === null) return reponseSegmentInvalide();

  try {
    await apiRequest<void>(buildPath(key), { method: 'DELETE', token });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(err.data, { status: err.status });
    }
    console.error('[BFF] Failed to delete draft.', err);
    return NextResponse.json({ code: 'server_error' }, { status: 500 });
  }
}
