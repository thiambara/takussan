'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import {
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_COOKIE_NAME,
  isLocale,
  type Locale,
} from '@/i18n/config';

/**
 * Persist the user's locale choice in the `NEXT_LOCALE` cookie and revalidate
 * the current page so the next render uses the new messages.
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
  });

  revalidatePath('/', 'layout');
}
