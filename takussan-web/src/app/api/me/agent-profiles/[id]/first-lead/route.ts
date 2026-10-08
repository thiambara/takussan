import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { jetonEspaceApplicatif } from '@/lib/impersonation';
import { reponseSegmentInvalide, segmentAmont } from '@/lib/segments-amont';


/**
 * TCK-259 — proxy for the Agent first-lead lookup (welcome step).
 *
 * Forwards the GET to the Laravel backend with the user's bearer token.
 */

const API_URL =
  (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8002').replace(/\/api$/, '');

type Params = Promise<{ id: string }>;

export async function GET(_req: NextRequest, ctx: { params: Params }): Promise<NextResponse> {
  const cookieStore = await cookies();
  const token = jetonEspaceApplicatif(cookieStore);
  if (!token) {
    return NextResponse.json({ code: 'unauthenticated' }, { status: 401 });
  }

  const id = segmentAmont((await ctx.params).id);
  if (id === null) return reponseSegmentInvalide();

  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ code: 'invalid_profile_id' }, { status: 400 });
  }

  const upstream = await fetch(`${API_URL}/api/me/agent-profiles/${id}/first-lead`, {
    method: 'GET',
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
