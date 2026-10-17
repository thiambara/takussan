import { NextRequest, NextResponse } from 'next/server';
import { jetonEspaceApplicatif } from '@/lib/impersonation';
import { origineApi } from '@/lib/config-publique';

async function forward(request: NextRequest): Promise<NextResponse> {
  const token = jetonEspaceApplicatif(request.cookies);
  if (!token) return NextResponse.json({ code: 'unauthenticated' }, { status: 401 });

  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  const upstream = await fetch(`${origineApi()}/api/me/data-exports${request.nextUrl.search}`, {
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
