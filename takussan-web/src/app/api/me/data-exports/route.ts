import { NextRequest, NextResponse } from 'next/server';
import { jetonEspaceApplicatif } from '@/lib/impersonation';
import { urlApiServeur } from '@/lib/api';
import { enTetesDuRelais } from '@/lib/relais-api';

async function forward(request: NextRequest): Promise<NextResponse> {
  const token = jetonEspaceApplicatif(request.cookies);
  if (!token) return NextResponse.json({ code: 'unauthenticated' }, { status: 401 });

  const headers: Record<string, string> = {
    ...(await enTetesDuRelais(request)),
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  const upstream = await fetch(urlApiServeur(`/me/data-exports${request.nextUrl.search}`), {
    method: request.method,
    headers,
  });
  const body = await upstream.text();
  const ct = upstream.headers.get('content-type');
  return new NextResponse(body, { status: upstream.status, headers: ct ? { 'Content-Type': ct } : undefined });
}

export async function GET(request: NextRequest) {
  return forward(request);
}

export async function POST(request: NextRequest) {
  return forward(request);
}
