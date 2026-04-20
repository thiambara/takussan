'use server';

import { cache } from 'react';
import { ApiError } from '@/lib/api';
import { getMe, logout, resendVerification, updateProfile, UpdateProfilePayload } from '@/lib/auth';
import { clearToken, getToken } from '@/lib/session';
import { redirect } from 'next/navigation';

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

export async function updateProfileAction(
  formData: FormData,
): Promise<{ ok: boolean; message?: string }> {
  const token = await getToken();
  if (!token) return { ok: false, message: 'Not authenticated.' };

  const payload: UpdateProfilePayload = {
    first_name: formData.get('first_name') as string,
    last_name: formData.get('last_name') as string,
    bio: (formData.get('bio') as string) || undefined,
  };

  const avatarFile = formData.get('avatar') as File | null;
  if (avatarFile && avatarFile.size > 0) {
    payload.avatar = avatarFile;
  }

  try {
    await updateProfile(token, payload);
    return { ok: true };
  } catch {
    return { ok: false, message: 'Failed to update profile.' };
  }
}

// Memoized per-request so layouts and pages can both call getMeAction()
// without triggering duplicate HTTP requests to the API.
const cachedGetMe = cache(async () => {
  const token = await getToken();
  if (!token) redirect('/auth/login');

  try {
    return await getMe(token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      await clearToken();
      redirect('/auth/login');
    }
    throw err;
  }
});

export async function getMeAction() {
  return cachedGetMe();
}
