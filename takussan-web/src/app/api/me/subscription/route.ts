import { NextRequest, NextResponse } from 'next/server';
import { jetonEspaceApplicatif, profilActifEspaceApplicatif } from '@/lib/impersonation';

const API_URL = process.env.NEXT_PUBLIC_API_URL
  ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api$/, '')
  : 'http://localhost:8002';

export async function GET(request: NextRequest) {
  const token = jetonEspaceApplicatif(request.cookies);
  if (!token) return NextResponse.json({ code: 'unauthenticated' }, { status: 401 });

  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  const activeProfileId = profilActifEspaceApplicatif(request.cookies);
  if (activeProfileId) headers['X-Active-Profile-Hint'] = activeProfileId;

  const upstream = await fetch(`${API_URL}/api/me/subscription${request.nextUrl.search}`, { headers });
  return new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
