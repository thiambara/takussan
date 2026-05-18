'use server';

import { cookies } from 'next/headers';

import { ApiError } from '@/lib/api';
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

function failure(err: unknown, fallback: string): ActionResult<never> {
  if (err instanceof ApiError) {
    const data = err.data as { errors?: Record<string, string[]>; message?: string } | null;
    return {
      ok: false,
      status: err.status,
      message: err.displayMessage,
      errors: data?.errors,
    };
  }
  return { ok: false, message: fallback };
}

export async function ownerSubmitKycAction(
  ownerProfileId: number,
): Promise<ActionResult<OwnerKycSubmitResponse['data']>> {
  const token = await getToken();
  if (!token) return { ok: false, status: 401, message: 'Vous devez être connecté.' };

  try {
    const res = await submitOwnerKyc(token, ownerProfileId);
    return { ok: true, data: res.data };
  } catch (err) {
    return failure(err, "Impossible de soumettre votre dossier KYC.");
  }
}

export async function ownerOnboardCompleteAction(
  ownerProfileId: number,
  otpCode?: string,
): Promise<ActionResult<OwnerOnboardCompleteResponse['data']>> {
  const token = await getToken();
  if (!token) return { ok: false, status: 401, message: 'Vous devez être connecté.' };

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
    return failure(err, "Impossible de finaliser votre onboarding.");
  }
}

export async function getOwnerPropertiesAction(
  ownerProfileId: number,
): Promise<ActionResult<OwnerPropertiesResponse>> {
  const token = await getToken();
  if (!token) return { ok: false, status: 401, message: 'Vous devez être connecté.' };

  try {
    const res = await fetchOwnerProperties(token, ownerProfileId);
    return { ok: true, data: res };
  } catch (err) {
    return failure(err, 'Impossible de charger vos biens.');
  }
}
