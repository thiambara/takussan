'use server';

import { cookies } from 'next/headers';

import { ApiError, messageErreurApi } from '@/lib/api';
import {
  hostIndividualOnboard,
  ouvrirMonAgence,
  type HostIndividualOnboardPayload,
  type HostIndividualOnboardResponse,
  type OuvertureDAgencePayload,
  type OuvertureDAgenceResponse,
} from '@/lib/onboarding';
import { ACTIVE_PROFILE_COOKIE } from '@/lib/profiles';
import { getToken } from '@/lib/session';
import { getTranslations } from 'next-intl/server';
import { journaliserErreurInattendue } from '@/lib/journal-erreur-action';

/**
 * TCK-255 — Server action consumed by `<HostIndividualWizard>`.
 *
 * Forwards the validated payload to the Laravel endpoint and persists
 * the returned `active_profile_id` as an HttpOnly cookie so the next
 * navigation immediately resolves the new agency context (matches the
 * `MeProfilesController::updateActive()` cookie semantics).
 */
export type HostIndividualOnboardActionResult =
  | { ok: true; data: HostIndividualOnboardResponse['data'] }
  | { ok: false; status?: number; message: string; errors?: Record<string, string[]> };

export async function hostIndividualOnboardAction(
  payload: HostIndividualOnboardPayload,
): Promise<HostIndividualOnboardActionResult> {
  const t = await getTranslations('serverActions.hostOnboarding');
  const token = await getToken();
  if (!token) {
    return { ok: false, status: 401, message: t('mustBeSignedInToContinue') };
  }

  try {
    const res = await hostIndividualOnboard(token, payload);

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_PROFILE_COOKIE, res.data.active_profile_id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });

    return { ok: true, data: res.data };
  } catch (err) {
    journaliserErreurInattendue('onboarding', err);
    if (err instanceof ApiError) {
      const data = err.data as { errors?: Record<string, string[]>; message?: string } | null;
      return {
        ok: false,
        status: err.status,
        // Module `'use server'` : traduction explicite, sinon la CLÉ `errors.api.*` part à l'écran.
        message: messageErreurApi(err, await getTranslations(), t('completeFailed')),
        errors: data?.errors,
      };
    }
    return {
      ok: false,
      message: t('completeFailed'),
    };
  }
}

/**
 * TCK-2938 — « Créer mon espace pro » (orientation) : `POST /api/me/agencies` (ADR-0125), puis le
 * cookie du profil actif — le `Set-Cookie` de l'API ne traverse pas une action serveur, comme pour
 * {@link hostIndividualOnboardAction}. Le `code` de Laravel est rendu tel quel : l'écran réagit à
 * `agency.phone_unverified` (il remontre la vérification du numéro) et à `agency.already_admin`.
 */
export type OuvertureDAgenceActionResult =
  | { ok: true; data: OuvertureDAgenceResponse['data'] }
  | { ok: false; status?: number; code?: string; message: string };

export async function ouvrirMonAgenceAction(payload: OuvertureDAgencePayload): Promise<OuvertureDAgenceActionResult> {
  const t = await getTranslations('serverActions.hostOnboarding');
  const token = await getToken();
  if (!token) {
    return { ok: false, status: 401, message: t('mustBeSignedInToContinue') };
  }

  try {
    const res = await ouvrirMonAgence(token, payload);
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_PROFILE_COOKIE, res.data.active_profile_id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return { ok: true, data: res.data };
  } catch (err) {
    journaliserErreurInattendue('onboarding', err);
    if (err instanceof ApiError) {
      const brut = (err.data as { code?: unknown } | null)?.code;
      return {
        ok: false,
        status: err.status,
        code: typeof brut === 'string' ? brut : undefined,
        message: messageErreurApi(err, await getTranslations(), t('completeFailed')),
      };
    }
    return { ok: false, message: t('completeFailed') };
  }
}
