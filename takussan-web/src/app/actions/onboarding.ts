'use server';

import { cookies } from 'next/headers';

import { ApiError } from '@/lib/api';
import {
  hostIndividualOnboard,
  type HostIndividualOnboardPayload,
  type HostIndividualOnboardResponse,
} from '@/lib/onboarding';
import { ACTIVE_PROFILE_COOKIE } from '@/lib/profiles';
import { getToken } from '@/lib/session';

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
  const token = await getToken();
  if (!token) {
    return { ok: false, status: 401, message: 'Vous devez être connecté pour continuer.' };
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
    if (err instanceof ApiError) {
      const data = err.data as { errors?: Record<string, string[]>; message?: string } | null;
      return {
        ok: false,
        status: err.status,
        message: err.displayMessage,
        errors: data?.errors,
      };
    }
    return {
      ok: false,
      message: 'Impossible de finaliser la création de votre espace. Réessayez.',
    };
  }
}
