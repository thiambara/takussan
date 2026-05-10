'use server';

import { cookies } from 'next/headers';

import { ApiError } from '@/lib/api';
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

export async function agentSubmitKycAction(
  agentProfileId: number,
): Promise<ActionResult<AgentKycSubmitResponse['data']>> {
  const token = await getToken();
  if (!token) return { ok: false, status: 401, message: 'Vous devez être connecté.' };

  try {
    const res = await submitAgentKyc(token, agentProfileId);
    return { ok: true, data: res.data };
  } catch (err) {
    return failure(err, 'Impossible de soumettre votre dossier KYC.');
  }
}

export async function agentUpdateSpecializationAction(
  agentProfileId: number,
  payload: AgentSpecializationPayload,
): Promise<ActionResult<AgentSpecializationResponse['data']>> {
  const token = await getToken();
  if (!token) return { ok: false, status: 401, message: 'Vous devez être connecté.' };

  try {
    const res = await patchAgentSpecialization(token, agentProfileId, payload);
    return { ok: true, data: res.data };
  } catch (err) {
    return failure(err, 'Impossible d’enregistrer votre spécialisation.');
  }
}

export async function getAgentFirstLeadAction(
  agentProfileId: number,
): Promise<ActionResult<AgentFirstLeadResponse['data']>> {
  const token = await getToken();
  if (!token) return { ok: false, status: 401, message: 'Vous devez être connecté.' };

  try {
    const res = await fetchAgentFirstLead(token, agentProfileId);
    return { ok: true, data: res.data };
  } catch (err) {
    return failure(err, 'Impossible de charger votre premier lead.');
  }
}

export async function agentOnboardCompleteAction(
  agentProfileId: number,
  otpCode?: string,
): Promise<ActionResult<AgentOnboardCompleteResponse['data']>> {
  const token = await getToken();
  if (!token) return { ok: false, status: 401, message: 'Vous devez être connecté.' };

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
    return failure(err, 'Impossible de finaliser votre onboarding.');
  }
}
