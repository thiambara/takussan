'use server';

import { cookies } from 'next/headers';

import { ApiError, messageErreurApi } from '@/lib/api';
import {
  completeAgentOnboarding,
  fetchAgentFirstLead,
  patchAgentSpecialization,
  submitAgentKyc,
  type AgentFirstLeadResponse,
  type AgentKycSubmitResponse,
  type AgentOnboardCompleteResponse,
  type AgentSpecializationPayload,
  type AgentSpecializationResponse,
} from '@/lib/agent-onboarding';
import { ACTIVE_PROFILE_COOKIE } from '@/lib/profiles';
import { getToken } from '@/lib/session';
import { getTranslations } from 'next-intl/server';

/**
 * TCK-259 — server actions consumed by `<AgentOnboardingWizard>`.
 *
 * KYC upload uses a multipart body and is submitted from the client via
 * `fetch('/api/me/agent-profiles/{id}/kyc/upload', ...)` directly to the
 * SSR proxy — not exposed here (mirror Owner / SP).
 */

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status?: number; message: string; errors?: Record<string, string[]> };

/** Clés de repli de `serverActions.agentOnboarding` — l'union tient lieu de contrôle de frappe. */
type CleRepli = 'kycFailed' | 'specializationFailed' | 'firstLeadFailed' | 'completeFailed';

async function failure(err: unknown, cleRepli: CleRepli): Promise<ActionResult<never>> {
  // Module `'use server'` : le texte se compose ICI, avec `getTranslations`. Voir `src/lib/api.ts`.
  const [tRacine, t] = await Promise.all([getTranslations(), getTranslations('serverActions.agentOnboarding')]);
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

export async function agentSubmitKycAction(
  agentProfileId: number,
): Promise<ActionResult<AgentKycSubmitResponse['data']>> {
  const token = await getToken();
  if (!token) return nonConnecte();

  try {
    const res = await submitAgentKyc(token, agentProfileId);
    return { ok: true, data: res.data };
  } catch (err) {
    return failure(err, 'kycFailed');
  }
}

export async function agentUpdateSpecializationAction(
  agentProfileId: number,
  payload: AgentSpecializationPayload,
): Promise<ActionResult<AgentSpecializationResponse['data']>> {
  const token = await getToken();
  if (!token) return nonConnecte();

  try {
    const res = await patchAgentSpecialization(token, agentProfileId, payload);
    return { ok: true, data: res.data };
  } catch (err) {
    return failure(err, 'specializationFailed');
  }
}

export async function getAgentFirstLeadAction(
  agentProfileId: number,
): Promise<ActionResult<AgentFirstLeadResponse['data']>> {
  const token = await getToken();
  if (!token) return nonConnecte();

  try {
    const res = await fetchAgentFirstLead(token, agentProfileId);
    return { ok: true, data: res.data };
  } catch (err) {
    return failure(err, 'firstLeadFailed');
  }
}

export async function agentOnboardCompleteAction(
  agentProfileId: number,
  otpCode?: string,
): Promise<ActionResult<AgentOnboardCompleteResponse['data']>> {
  const token = await getToken();
  if (!token) return nonConnecte();

  try {
    const res = await completeAgentOnboarding(token, {
      agent_profile_id: agentProfileId,
      phone_otp: otpCode ? { code: otpCode } : undefined,
    });

    // Pin the active profile cookie server-side (mirror Owner / SP wizard).
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
