'use server';

import { cache } from 'react';
import { revalidatePath } from 'next/cache';
import { ApiError, messageErreurApi } from '@/lib/api';
import { getMe, resendVerification, updateProfile, UpdateProfilePayload } from '@/lib/auth';
import { getOperatorActiveProfileId, getOperatorToken, getToken } from '@/lib/session';
import { utilisateurDuRendu } from '@/lib/utilisateur-du-rendu';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { User } from '@/types/user';
import { journaliserErreurInattendue } from '@/lib/journal-erreur-action';

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
  } catch (err) {
    journaliserErreurInattendue('auth', err);
    const t = await getTranslations('serverActions.auth');
    return { ok: false, message: t('resendFailed') };
  }
}

// TCK-509 — il n'y a PAS de server action de déconnexion, et c'est délibéré. `logoutAction`
// effaçait le cookie côté serveur puis redirigeait : le client ne l'apprenait jamais, et le
// navigateur continuait de transmettre le jeton révoqué, y compris au compte connecté ensuite. La
// déconnexion passe par `useAuth().logout` — cf. `src/context/__tests__/AuthContext.chemin-unique.test.ts`.

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

  const payload: UpdateProfilePayload = {};
  // TCK-1351 (P149.03) — relayée dès que le formulaire la porte, chaîne vide comprise : c'est ainsi
  // qu'on efface sa présentation (`|| undefined` la retirait du corps, et l'API la gardait).
  const bio = formData.get('bio');
  if (typeof bio === 'string') payload.bio = bio;
  // TCK-623 — un nom absent du formulaire n'est pas un nom vide : `formData.get` rendrait `null`,
  // envoyé en toutes lettres « null ».
  for (const champ of ['first_name', 'last_name'] as const) {
    const valeur = formData.get(champ);
    if (typeof valeur === 'string') payload[champ] = valeur;
  }

  // Only forward `phone` if the form explicitly carried the field — keeps
  // legacy callers (no phone input) from clearing existing values.
  if (formData.has('phone')) {
    const raw = formData.get('phone');
    payload.phone = typeof raw === 'string' ? raw : null;
  }
  // TCK-632 — comme le numéro : seulement si le formulaire porte le champ.
  const email = formData.get('email');
  if (typeof email === 'string') payload.email = email;
  // TCK-589 p3-1 — la preuve du remplacement d'un numéro vérifié, relayée telle quelle.
  for (const champ of ['current_password', 'phone_change_code'] as const) {
    const valeur = formData.get(champ);
    if (typeof valeur === 'string' && valeur !== '') payload[champ] = valeur;
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
    journaliserErreurInattendue('auth', err);
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
// without triggering duplicate HTTP requests to the API. TCK-1374 (P138.02) — la lecture elle-même
// est `utilisateurDuRendu`, que la mise en page racine partage : un seul `/api/auth/me` par document.
const cachedGetMe = cache(async () => {
  let user: User | null;
  try {
    user = await utilisateurDuRendu();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      // getMeAction is called during RSC render from layouts/pages, where
      // cookies() is read-only. Redirect to a Route Handler that clears
      // the stale cookie and bounces to /auth/login.
      redirect('/api/auth/session-expired');
    }
    throw err;
  }
  if (!user) redirect('/auth/login');
  return user;
});

export async function getMeAction() {
  return cachedGetMe();
}

// TCK-600 (ADR-0055 §6) — l'OPÉRATEUR, impersonation ou non : la console lit avec son propre jeton.
const cachedGetMeOperateur = cache(async () => {
  const token = await getOperatorToken();
  if (!token) redirect('/auth/login');

  try {
    // TCK-1374 (P138.02) — hors impersonation, le jeton et le profil de l'opérateur sont ceux de
    // l'espace applicatif : la lecture du rendu, déjà faite par la mise en page racine, sert.
    if (token === (await getToken())) {
      const user = await utilisateurDuRendu();
      if (user) return user;
    }
    return await getMe(token, await getOperatorActiveProfileId());
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect('/api/auth/session-expired');
    }
    throw err;
  }
});

export async function getMeOperateurAction() {
  return cachedGetMeOperateur();
}
