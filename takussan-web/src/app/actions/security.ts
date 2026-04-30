'use server';

import { ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import {
  listActiveSessions,
  phoneSendOtp,
  phoneVerifyOtp,
  revokeSession,
  twoFactorConfirm,
  twoFactorDisable,
  twoFactorEnable,
  twoFactorRegenerateRecoveryCodes,
  type ActiveSession,
  type TwoFactorConfirmResponse,
  type TwoFactorEnableResponse,
} from '@/lib/security';

/**
 * TCK-069 — thin server-action wrappers that read the Sanctum token from
 * the HttpOnly cookie. All actions return `{ ok, ... }` envelopes rather
 * than throwing — the UI renders the error message directly.
 */

function requireToken(
  token: string | null | undefined,
): asserts token is string {
  if (!token) throw new ApiError(401, { message: 'Not authenticated.' });
}

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

function failure(err: unknown, fallback: string): { ok: false; message: string } {
  if (err instanceof ApiError) {
    return { ok: false, message: err.displayMessage || fallback };
  }
  return { ok: false, message: fallback };
}

export async function twoFactorEnableAction(): Promise<
  ActionResult<TwoFactorEnableResponse>
> {
  try {
    const token = await getToken();
    requireToken(token);
    const data = await twoFactorEnable(token);
    return { ok: true, data };
  } catch (err) {
    return failure(err, "Impossible d'activer la 2FA.");
  }
}

export async function twoFactorConfirmAction(
  code: string,
): Promise<ActionResult<TwoFactorConfirmResponse>> {
  try {
    const token = await getToken();
    requireToken(token);
    const data = await twoFactorConfirm(token, code);
    return { ok: true, data };
  } catch (err) {
    return failure(err, 'Code invalide.');
  }
}

export async function twoFactorDisableAction(payload: {
  password?: string;
  code?: string;
}): Promise<ActionResult<null>> {
  try {
    const token = await getToken();
    requireToken(token);
    await twoFactorDisable(token, payload);
    return { ok: true, data: null };
  } catch (err) {
    return failure(err, 'Impossible de désactiver la 2FA.');
  }
}

export async function twoFactorRegenerateAction(): Promise<
  ActionResult<{ recovery_codes: string[] }>
> {
  try {
    const token = await getToken();
    requireToken(token);
    const codes = await twoFactorRegenerateRecoveryCodes(token);
    return { ok: true, data: { recovery_codes: codes } };
  } catch (err) {
    return failure(err, 'Impossible de régénérer les codes de récupération.');
  }
}

export async function phoneSendOtpAction(): Promise<
  ActionResult<{ sent: boolean; debug_code?: string }>
> {
  try {
    const token = await getToken();
    requireToken(token);
    const data = await phoneSendOtp(token);
    return { ok: true, data };
  } catch (err) {
    return failure(err, "Impossible d'envoyer le code.");
  }
}

export async function phoneVerifyOtpAction(
  code: string,
): Promise<ActionResult<null>> {
  try {
    const token = await getToken();
    requireToken(token);
    await phoneVerifyOtp(token, code);
    return { ok: true, data: null };
  } catch (err) {
    return failure(err, 'Code invalide ou expiré.');
  }
}

export async function listActiveSessionsAction(): Promise<
  ActionResult<ActiveSession[]>
> {
  try {
    const token = await getToken();
    requireToken(token);
    const data = await listActiveSessions(token);
    return { ok: true, data };
  } catch (err) {
    return failure(err, 'Impossible de charger les sessions actives.');
  }
}

export async function revokeSessionAction(
  sessionId: number,
): Promise<ActionResult<null>> {
  try {
    const token = await getToken();
    requireToken(token);
    await revokeSession(token, sessionId);
    return { ok: true, data: null };
  } catch (err) {
    return failure(err, 'Impossible de révoquer cette session.');
  }
}
