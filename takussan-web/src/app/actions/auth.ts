'use server';

import { cache } from 'react';
import { revalidatePath } from 'next/cache';
import { ApiError, messageErreurApi } from '@/lib/api';
import { getMe, logout, resendVerification, updateProfile, UpdateProfilePayload } from '@/lib/auth';
import { clearToken, getActiveProfileId, getToken } from '@/lib/session';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { User } from '@/types/user';

export async function resendVerificationEmailAction(): Promise<{ ok: boolean; message?: string }> {
  const token = await getToken();
  if (!token) {
    // Les deux littéraux de cette action étaient en anglais, et rendus tels quels (TCK-292, lot K).
    const tErr = await getTranslations('errors');
    return { ok: false, message: tErr('missingToken') };
  }

  try {
    // Le `message` de l'API n'était pas rendu : `verify-email/page.tsx` ne lit que `result.ok`.
    // Le relayer revenait à faire traverser à une prose non traduite toute la frontière serveur
    // pour être jetée à l'arrivée. Retiré — la garde de ce module refuse désormais la forme.
    await resendVerification(token);
    return { ok: true };
  } catch {
    const t = await getTranslations('serverActions.auth');
    return { ok: false, message: t('resendFailed') };
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
  if (!token) {
    const tErr = await getTranslations('errors');
    return { ok: false, message: tErr('missingToken') };
  }

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
    const [tRacine, t] = await Promise.all([
      getTranslations(),
      getTranslations('serverActions.auth'),
    ]);
    const repli = t('updateProfileFailed');
    if (err instanceof ApiError) {
      // ⚠️ REPLI MORT corrigé : `err.displayMessage || repli` ne prenait JAMAIS la branche droite,
      // `displayMessage` rendant une clé i18n — et une clé est *truthy*.
      return { ok: false, message: messageErreurApi(err, tRacine, repli) };
    }
    return { ok: false, message: repli };
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
