'use server';

import { cookies } from 'next/headers';

import { ApiError, messageErreurApi } from '@/lib/api';
import {
  completeOwnerOnboarding,
  fetchOwnerProperties,
  submitOwnerKyc,
  type OwnerKycSubmitResponse,
  type OwnerOnboardCompleteResponse,
  type OwnerPropertiesResponse,
} from '@/lib/owner-onboarding';
import { ACTIVE_PROFILE_COOKIE } from '@/lib/profiles';
import { getToken } from '@/lib/session';
import { getTranslations } from 'next-intl/server';

/**
 * TCK-257 — server actions consumed by `<OwnerOnboardingWizard>`.
 *
 * The KYC upload uses a multipart body and is submitted from the client
 * via `fetch('/api/me/owner-profiles/{id}/kyc/upload', ...)` directly to
 * the SSR proxy — not exposed here.
 */

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status?: number; message: string; errors?: Record<string, string[]> };

/** Clés de repli de `serverActions.ownerOnboarding` — l'union tient lieu de contrôle de frappe. */
type CleRepli = 'kycFailed' | 'completeFailed' | 'propertiesFailed';

async function failure(err: unknown, cleRepli: CleRepli): Promise<ActionResult<never>> {
  // Module `'use server'` : le texte se compose ICI, avec `getTranslations`. Voir `src/lib/api.ts`.
  const [tRacine, t] = await Promise.all([getTranslations(), getTranslations('serverActions.ownerOnboarding')]);
  const repli = t(cleRepli);
  if (err instanceof ApiError) {
    const data = err.data as { errors?: Record<string, string[]>; message?: string } | null;
    return {
      ok: false,
      status: err.status,
      message: messageErreurApi(err, tRacine, repli),
      errors: data?.errors,
    };
  }
  return { ok: false, message: repli };
}

/** Repli commun aux quatre actions : le jeton manque, rien n'a été tenté. */
async function nonConnecte(): Promise<ActionResult<never>> {
  const t = await getTranslations('serverActions.shared');
  return { ok: false, status: 401, message: t('mustBeSignedIn') };
}

export async function ownerSubmitKycAction(
  ownerProfileId: number,
): Promise<ActionResult<OwnerKycSubmitResponse['data']>> {
  const token = await getToken();
  if (!token) return nonConnecte();

  try {
    const res = await submitOwnerKyc(token, ownerProfileId);
    return { ok: true, data: res.data };
  } catch (err) {
    return failure(err, 'kycFailed');
  }
}

export async function ownerOnboardCompleteAction(
  ownerProfileId: number,
  otpCode?: string,
): Promise<ActionResult<OwnerOnboardCompleteResponse['data']>> {
  const token = await getToken();
  if (!token) return nonConnecte();

  try {
    const res = await completeOwnerOnboarding(token, {
      owner_profile_id: ownerProfileId,
      phone_otp: otpCode ? { code: otpCode } : undefined,
    });

    // Pin the active profile cookie server-side (mirror SP wizard).
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
    return failure(err, 'completeFailed');
  }
}

export async function getOwnerPropertiesAction(
  ownerProfileId: number,
): Promise<ActionResult<OwnerPropertiesResponse>> {
  const token = await getToken();
  if (!token) return nonConnecte();

  try {
    const res = await fetchOwnerProperties(token, ownerProfileId);
    return { ok: true, data: res };
  } catch (err) {
    return failure(err, 'propertiesFailed');
  }
}
