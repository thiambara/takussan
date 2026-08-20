'use server';

import { ApiError, messageErreurApi } from '@/lib/api';
import {
  ACTIVE_PROFILE_COOKIE,
  fetchMyProfiles,
  patchActiveProfile,
} from '@/lib/profiles';
import { getToken } from '@/lib/session';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import type { MyProfilesResponse, Profile } from '@/types/profile';

export type ProfilesActionResult =
  | { ok: true; data: MyProfilesResponse }
  | { ok: false; message: string };

export type SwitchProfileActionResult =
  | { ok: true; data: Profile }
  | { ok: false; message: string };

export async function getMyProfilesAction(): Promise<ProfilesActionResult> {
  const token = await getToken();
  if (!token) {
    // Les quatre littéraux de ce module étaient en anglais, et rendus tels quels (TCK-292, lot K).
    const tErr = await getTranslations('errors');
    return { ok: false, message: tErr('missingToken') };
  }

  const cookieStore = await cookies();
  const active = cookieStore.get(ACTIVE_PROFILE_COOKIE)?.value;

  try {
    const data = await fetchMyProfiles(token, active);
    return { ok: true, data };
  } catch (err) {
    const [tRacine, t] = await Promise.all([
      getTranslations(),
      getTranslations('serverActions.profiles'),
    ]);
    const repli = t('loadFailed');
    if (err instanceof ApiError) {
      // Module `'use server'` : `err.displayMessage` seul rendait ici la CLÉ `errors.api.*`.
      return { ok: false, message: messageErreurApi(err, tRacine, repli) };
    }
    return { ok: false, message: repli };
  }
}

export async function switchActiveProfileAction(
  profileId: string,
): Promise<SwitchProfileActionResult> {
  const token = await getToken();
  if (!token) {
    const tErr = await getTranslations('errors');
    return { ok: false, message: tErr('missingToken') };
  }

  try {
    const res = await patchActiveProfile(token, profileId);
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_PROFILE_COOKIE, res.data.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return { ok: true, data: res.data };
  } catch (err) {
    const [tRacine, t] = await Promise.all([
      getTranslations(),
      getTranslations('serverActions.profiles'),
    ]);
    const repli = t('switchFailed');
    if (err instanceof ApiError) {
      // Module `'use server'` : `err.displayMessage` seul rendait ici la CLÉ `errors.api.*`.
      return { ok: false, message: messageErreurApi(err, tRacine, repli) };
    }
    return { ok: false, message: repli };
  }
}
