'use server';

import { cache } from 'react';
import { revalidatePath } from 'next/cache';
import { ApiError } from '@/lib/api';
import { getMe, logout, resendVerification, updateProfile, UpdateProfilePayload } from '@/lib/auth';
import { clearToken, getActiveProfileId, getToken } from '@/lib/session';
import { redirect } from 'next/navigation';
import type { User } from '@/types/user';

export async function resendVerificationEmailAction(): Promise<{ ok: boolean; message?: string }> {
  const token = await getToken();
  if (!token) return { ok: false, message: 'Not authenticated.' };

  try {
    const result = await resendVerification(token);
    return { ok: true, message: result.message };
  } catch {
    return { ok: false, message: 'Failed to resend verification email.' };
  }
}

export async function logoutAction(): Promise<void> {
  const token = await getToken();
  if (token) {
    try {
      await logout(token);
    } catch {
      // Proceed with client-side cleanup regardless
    }
  }
  await clearToken();
  redirect('/auth/login');
}

export type UpdateProfileResult =
  | { ok: true; user: User }
  | { ok: false; message: string };

export async function updateProfileAction(
  formData: FormData,
): Promise<UpdateProfileResult> {
  const token = await getToken();
  if (!token) return { ok: false, message: 'Not authenticated.' };

  const payload: UpdateProfilePayload = {
    first_name: formData.get('first_name') as string,
    last_name: formData.get('last_name') as string,
    bio: (formData.get('bio') as string) || undefined,
  };

  // Only forward `phone` if the form explicitly carried the field — keeps
  // legacy callers (no phone input) from clearing existing values.
  if (formData.has('phone')) {
    const raw = formData.get('phone');
    payload.phone = typeof raw === 'string' ? raw : null;
  }

  const avatarFile = formData.get('avatar') as File | null;
  if (avatarFile && avatarFile.size > 0) {
    payload.avatar = avatarFile;
  }
  payload.avatar_remove = formData.get('avatar_remove') === '1';

  try {
    const user = await updateProfile(token, payload);
    revalidatePath('/app/profile');
    revalidatePath('/app');
    return { ok: true, user };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, message: err.displayMessage || 'Failed to update profile.' };
    }
    return { ok: false, message: 'Failed to update profile.' };
  }
}

// Memoized per-request so layouts and pages can both call getMeAction()
// without triggering duplicate HTTP requests to the API.
const cachedGetMe = cache(async () => {
  const token = await getToken();
  if (!token) redirect('/auth/login');

  const activeProfileId = await getActiveProfileId();

  try {
    return await getMe(token, activeProfileId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      // getMeAction is called during RSC render from layouts/pages, where
      // cookies() is read-only. Redirect to a Route Handler that clears
      // the stale cookie and bounces to /auth/login.
      redirect('/api/auth/session-expired');
    }
    throw err;
  }
});

export async function getMeAction() {
  return cachedGetMe();
}
