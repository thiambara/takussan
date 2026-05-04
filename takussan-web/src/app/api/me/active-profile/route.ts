import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { ACTIVE_PROFILE_COOKIE, patchActiveProfile } from '@/lib/profiles';
import { ApiError } from '@/lib/api';
import { NextRequest, NextResponse } from 'next/server';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json(null, { status: 401 });

  let payload: { profile_id?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body.' }, { status: 400 });
  }

  if (typeof payload.profile_id !== 'string' || payload.profile_id.length === 0) {
    return NextResponse.json({ message: 'profile_id is required.' }, { status: 422 });
  }

  try {
    const result = await patchActiveProfile(token, payload.profile_id);
    const response = NextResponse.json(result);
    response.cookies.set(ACTIVE_PROFILE_COOKIE, result.data.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE,
    });
    return response;
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(err.data, { status: err.status });
    }
    return NextResponse.json({ message: 'Failed to switch profile.' }, { status: 500 });
  }
}
