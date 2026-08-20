'use server';

import { cookies } from 'next/headers';

import { ApiError, messageErreurApi } from '@/lib/api';
import { ACTIVE_PROFILE_COOKIE } from '@/lib/profiles';
import { getToken } from '@/lib/session';
import { getTranslations } from 'next-intl/server';
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

/** Clés de repli de `serverActions.serviceProviderOnboarding` — l'union tient lieu de contrôle de frappe. */
type CleRepli = 'tradesFailed' | 'availabilityFailed' | 'completeFailed' | 'agenciesFailed';

async function failure(err: unknown, cleRepli: CleRepli): Promise<ActionResult<never>> {
  // Module `'use server'` : le texte se compose ICI, avec `getTranslations`. Voir `src/lib/api.ts`.
  const [tRacine, t] = await Promise.all([getTranslations(), getTranslations('serverActions.serviceProviderOnboarding')]);
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

export async function spPatchTradesAction(
  spProfileId: number,
  payload: TradesPayload,
): Promise<ActionResult<{ id: number }>> {
  const token = await getToken();
  if (!token) return nonConnecte();

  try {
    const res = await patchSpTrades(token, spProfileId, payload);
    return { ok: true, data: { id: res.data.id } };
  } catch (err) {
    return failure(err, 'tradesFailed');
  }
}

export async function spPatchAvailabilityAction(
  spProfileId: number,
  slots: AvailabilitySlot[],
): Promise<ActionResult<{ id: number }>> {
  const token = await getToken();
  if (!token) return nonConnecte();

  try {
    const res = await patchSpAvailability(token, spProfileId, { available_slots: slots });
    return { ok: true, data: { id: res.data.id } };
  } catch (err) {
    return failure(err, 'availabilityFailed');
  }
}

export async function spOnboardCompleteAction(
  spProfileId: number,
  otpCode?: string,
): Promise<ActionResult<OnboardCompleteResponse['data']>> {
  const token = await getToken();
  if (!token) return nonConnecte();

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
    return failure(err, 'completeFailed');
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
  if (!token) return nonConnecte();

  try {
    const res = await fetchSpAgencies(token);
    return { ok: true, data: res };
  } catch (err) {
    return failure(err, 'agenciesFailed');
  }
}
