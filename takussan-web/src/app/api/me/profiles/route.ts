import { fetchMyProfiles } from '@/lib/profiles';
import { ApiError } from '@/lib/api';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { jetonEspaceApplicatif, profilActifEspaceApplicatif } from '@/lib/impersonation';

export async function GET(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const token = jetonEspaceApplicatif(cookieStore);
  if (!token) return NextResponse.json(null, { status: 401 });

  const active = profilActifEspaceApplicatif(cookieStore);

  try {
    const data = await fetchMyProfiles(token, active);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(err.data, { status: err.status });
    }
    console.error('[BFF] Failed to load profiles.', err);
    return NextResponse.json({ code: 'server_error' }, { status: 500 });
  }
}
