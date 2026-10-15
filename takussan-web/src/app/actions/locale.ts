'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { apiRequest } from '@/lib/api';
import { AUTH_COOKIE_NAME } from '@/lib/constants';
import {
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_COOKIE_NAME,
  isLocale,
  type Locale,
} from '@/i18n/config';

/**
 * Persist the user's locale choice in the `NEXT_LOCALE` cookie and revalidate
 * the current page so the next render uses the new messages.
 *
 * TCK-017: when the visitor is authenticated, also best-effort PATCH
 * `/api/me` so the preference follows the user across devices — and reaches
 * the e-mails, SMS and notifications, which follow `preferred_language`.
 * TCK-655: the path was `/api/users/me`, a route that never existed.
 * Anonymous visitors rely on the cookie only; any network/endpoint failure
 * is swallowed — the cookie already satisfies the UX.
 */
export async function setLocaleAction(locale: Locale): Promise<void> {
  if (!isLocale(locale)) {
    throw new Error(`Invalid locale: ${String(locale)}`);
  }

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE_NAME, locale, {
    maxAge: LOCALE_COOKIE_MAX_AGE,
    path: '/',
    sameSite: 'lax',
    // Match the auth-cookie hygiene: ship `Secure` in prod so the locale
    // preference is never leaked over plaintext HTTP.
    secure: process.env.NODE_ENV === 'production',
  });

  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (token) {
    try {
      await apiRequest('/api/me', {
        method: 'PATCH',
        token,
        body: { preferred_language: locale },
      });
    } catch {
      // User lost auth, or API unreachable — cookie still wins.
    }
  }

  revalidatePath('/', 'layout');
}
