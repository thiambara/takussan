'use server';

import { ApiError } from '@/lib/api';
import {
  ACTIVE_PROFILE_COOKIE,
  fetchMyProfiles,
  patchActiveProfile,
} from '@/lib/profiles';
import { getToken } from '@/lib/session';
import { cookies } from 'next/headers';
import type { MyProfilesResponse, Profile } from '@/types/profile';

export type ProfilesActionResult =
  | { ok: true; data: MyProfilesResponse }
  | { ok: false; message: string };

export type SwitchProfileActionResult =
  | { ok: true; data: Profile }
  | { ok: false; message: string };

export async function getMyProfilesAction(): Promise<ProfilesActionResult> {
  const token = await getToken();
  if (!token) return { ok: false, message: 'Not authenticated.' };

  const cookieStore = await cookies();
  const active = cookieStore.get(ACTIVE_PROFILE_COOKIE)?.value;

  try {
    const data = await fetchMyProfiles(token, active);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, message: err.displayMessage };
    }
    return { ok: false, message: 'Failed to load profiles.' };
  }
}

export async function switchActiveProfileAction(
  profileId: string,
): Promise<SwitchProfileActionResult> {
  const token = await getToken();
  if (!token) return { ok: false, message: 'Not authenticated.' };

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
    if (err instanceof ApiError) {
      return { ok: false, message: err.displayMessage };
    }
    return { ok: false, message: 'Failed to switch profile.' };
  }
}
