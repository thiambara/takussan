import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { logout } from '@/lib/auth';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (token) {
    try {
      await logout(token);
    } catch {
      // Token already expired on backend — proceed to clear cookie
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(AUTH_COOKIE_NAME);
  return response;
}
