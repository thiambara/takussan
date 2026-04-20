import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { getMe } from '@/lib/auth';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json(null, { status: 401 });
  }

  try {
    const user = await getMe(token);
    return NextResponse.json(user);
  } catch {
    return NextResponse.json(null, { status: 401 });
  }
}
