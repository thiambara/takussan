import { NextRequest, NextResponse } from 'next/server';
import { jetonEspaceApplicatif } from '@/lib/impersonation';
import { reponseSegmentInvalide, segmentAmont } from '@/lib/segments-amont';

const API_URL = process.env.NEXT_PUBLIC_API_URL
  ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api$/, '')
  : 'http://localhost:8002';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const token = jetonEspaceApplicatif(request.cookies);
  if (!token) return NextResponse.json({ code: 'unauthenticated' }, { status: 401 });

  const id = segmentAmont((await ctx.params).id);
  if (id === null) return reponseSegmentInvalide();

  const upstream = await fetch(`${API_URL}/api/data-exports/${id}/download`, {
    headers: {
      Accept: 'application/zip,application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const body = await upstream.arrayBuffer();
  const headers: HeadersInit = {};
  for (const key of ['content-type', 'content-disposition', 'content-length']) {
    const value = upstream.headers.get(key);
    if (value) headers[key] = value;
  }
  return new NextResponse(body, { status: upstream.status, headers });
}
