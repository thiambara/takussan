'use server';

import { cookies } from 'next/headers';

import { ApiError } from '@/lib/api';
import { ACTIVE_PROFILE_COOKIE } from '@/lib/profiles';
import { getToken } from '@/lib/session';
import {
  completeSpOnboarding,
  fetchSpAgencies,
  patchSpAvailability,
  patchSpTrades,
  type AvailabilitySlot,
  type OnboardCompleteResponse,
  type ServiceProviderAgenciesResponse,
  type TradesPayload,
} from '@/lib/service-provider-onboarding';

/**
 * TCK-261 — server actions consumed by `<ServiceProviderOnboardingWizard>`.
 *
 * The KYC upload uses a multipart body and is therefore submitted from
 * the client via `fetch('/api/me/profiles/{id}/kyc/upload', ...)` directly
 * to the SSR proxy — not exposed here.
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

export async function spPatchTradesAction(
  spProfileId: number,
  payload: TradesPayload,
): Promise<ActionResult<{ id: number }>> {
  const token = await getToken();
  if (!token) return { ok: false, status: 401, message: 'Vous devez être connecté.' };

  try {
    const res = await patchSpTrades(token, spProfileId, payload);
    return { ok: true, data: { id: res.data.id } };
  } catch (err) {
    return failure(err, 'Impossible de sauvegarder vos métiers.');
  }
}

export async function spPatchAvailabilityAction(
  spProfileId: number,
  slots: AvailabilitySlot[],
): Promise<ActionResult<{ id: number }>> {
  const token = await getToken();
  if (!token) return { ok: false, status: 401, message: 'Vous devez être connecté.' };

  try {
    const res = await patchSpAvailability(token, spProfileId, { available_slots: slots });
    return { ok: true, data: { id: res.data.id } };
  } catch (err) {
    return failure(err, 'Impossible de sauvegarder vos disponibilités.');
  }
}

export async function spOnboardCompleteAction(
  spProfileId: number,
  otpCode?: string,
): Promise<ActionResult<OnboardCompleteResponse['data']>> {
  const token = await getToken();
  if (!token) return { ok: false, status: 401, message: 'Vous devez être connecté.' };

  try {
    const res = await completeSpOnboarding(token, {
      sp_profile_id: spProfileId,
      phone_otp: otpCode ? { code: otpCode } : undefined,
    });

    // Pin the active profile cookie server-side, mirroring the
    // host-individual onboarding action.
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
    return failure(err, 'Impossible de finaliser votre onboarding prestataire.');
  }
}

/**
 * TCK-262 — list the agencies the authenticated SP collaborates with
 * (cross-agencies). Used by the multi-agency welcome page and the SP
 * agency switcher menu.
 */
export async function getSpAgenciesAction(): Promise<
  ActionResult<ServiceProviderAgenciesResponse>
> {
  const token = await getToken();
  if (!token) return { ok: false, status: 401, message: 'Vous devez être connecté.' };

  try {
    const res = await fetchSpAgencies(token);
    return { ok: true, data: res };
  } catch (err) {
    return failure(err, 'Impossible de charger vos agences partenaires.');
  }
}
