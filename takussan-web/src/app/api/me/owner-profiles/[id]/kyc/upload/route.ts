import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import { AUTH_COOKIE_NAME } from '@/lib/constants';

/**
 * TCK-257 — multipart proxy for the Owner onboarding KYC uploader.
 *
 * Mirror of the SP proxy at `/api/me/profiles/[id]/kyc/upload` (TCK-261).
 * Server actions don't cleanly forward `multipart/form-data` bodies, so
 * the wizard POSTs directly to this Next route, which re-streams the
 * multipart body to the Laravel backend with the user's bearer token.
 */

const API_URL =
  (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8002').replace(/\/api$/, '');

type Params = Promise<{ id: string }>;

export async function POST(req: NextRequest, ctx: { params: Params }): Promise<NextResponse> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ message: 'Invalid profile id.' }, { status: 400 });
  }

  const upstream = await fetch(`${API_URL}/api/me/owner-profiles/${id}/kyc/upload`, {
    method: 'POST',
    body: req.body,
    // @ts-expect-error — Next supports `duplex: 'half'` to stream a request body
    duplex: 'half',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(req.headers.get('content-type')
        ? { 'Content-Type': req.headers.get('content-type')! }
        : {}),
    },
  });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
