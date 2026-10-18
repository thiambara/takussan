import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { jetonEspaceApplicatif } from '@/lib/impersonation';
import { reponseSegmentInvalide, segmentAmont } from '@/lib/segments-amont';
import { origineApi } from '@/lib/config-publique';


/**
 * TCK-257 — proxy for the Owner pre-attached properties listing.
 *
 * Forwards the GET (with query string for spatie/laravel-query-builder)
 * to the Laravel backend with the user's bearer token.
 */

type Params = Promise<{ id: string }>;

export async function GET(req: NextRequest, ctx: { params: Params }): Promise<NextResponse> {
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

  const search = req.nextUrl.search ?? '';
  const upstream = await fetch(
    `${origineApi()}/api/me/owner-profiles/${id}/properties${search}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    },
  );

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
