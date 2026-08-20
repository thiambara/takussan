import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { ACTIVE_PROFILE_COOKIE, fetchMyProfiles } from '@/lib/profiles';
import { ApiError } from '@/lib/api';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json(null, { status: 401 });

  const active = cookieStore.get(ACTIVE_PROFILE_COOKIE)?.value;

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
