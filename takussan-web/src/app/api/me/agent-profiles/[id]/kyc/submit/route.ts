import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import { AUTH_COOKIE_NAME } from '@/lib/constants';

/**
 * TCK-259 — proxy for the Agent KYC submission step.
 *
 * Forwards the no-body POST to the Laravel backend with the user's
 * bearer token. Mirrors the upload proxy.
 */

const API_URL =
  (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8002').replace(/\/api$/, '');

type Params = Promise<{ id: string }>;

export async function POST(_req: NextRequest, ctx: { params: Params }): Promise<NextResponse> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ code: 'unauthenticated' }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ code: 'invalid_profile_id' }, { status: 400 });
  }

  const upstream = await fetch(`${API_URL}/api/me/agent-profiles/${id}/kyc/submit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
