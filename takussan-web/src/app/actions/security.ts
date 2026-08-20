'use server';

import { ApiError, messageErreurApi } from '@/lib/api';
import { getToken } from '@/lib/session';
import { getTranslations } from 'next-intl/server';
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

/**
 * Le jeton manque. Le littéral d'origine était l'anglais « Not authenticated. », affiché tel quel
 * à un utilisateur francophone (TCK-292, lot K) ; `errors.missingToken` est la formulation déjà
 * retenue pour ce cas ailleurs dans le parc.
 */
async function jetonManquant(): Promise<string> {
  const tErr = await getTranslations('errors');
  return tErr('missingToken');
}

function requireToken(
  token: string | null | undefined,
  messageSiAbsent: string,
): asserts token is string {
  if (!token) throw new ApiError(401, { message: messageSiAbsent });
}

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

/** Clés de repli de `serverActions.security` — l'union tient lieu de contrôle de frappe. */
type CleRepli =
  | 'enableFailed'
  | 'invalidCode'
  | 'disableFailed'
  | 'regenerateFailed'
  | 'sendOtpFailed'
  | 'invalidOrExpiredCode'
  | 'sessionsFailed'
  | 'revokeSessionFailed';

async function failure(err: unknown, cleRepli: CleRepli): Promise<{ ok: false; message: string }> {
  const t = await getTranslations('serverActions.security');
  const repli = t(cleRepli);
  if (err instanceof ApiError) {
    // ⚠️ C'était `err.displayMessage || repli`, et le repli était MORT : `displayMessage` rendait
    // une clé i18n, et une clé est *truthy*. Un module `'use server'` traduit avec
    // `getTranslations`, jamais en lisant un libellé pré-calculé sur l'erreur.
    return { ok: false, message: messageErreurApi(err, await getTranslations(), repli) };
  }
  return { ok: false, message: repli };
}

export async function twoFactorEnableAction(): Promise<
  ActionResult<TwoFactorEnableResponse>
> {
  try {
    const token = await getToken();
    requireToken(token, await jetonManquant());
    const data = await twoFactorEnable(token);
    return { ok: true, data };
  } catch (err) {
    return failure(err, 'enableFailed');
  }
}

export async function twoFactorConfirmAction(
  code: string,
): Promise<ActionResult<TwoFactorConfirmResponse>> {
  try {
    const token = await getToken();
    requireToken(token, await jetonManquant());
    const data = await twoFactorConfirm(token, code);
    return { ok: true, data };
  } catch (err) {
    return failure(err, 'invalidCode');
  }
}

export async function twoFactorDisableAction(payload: {
  password?: string;
  code?: string;
}): Promise<ActionResult<null>> {
  try {
    const token = await getToken();
    requireToken(token, await jetonManquant());
    await twoFactorDisable(token, payload);
    return { ok: true, data: null };
  } catch (err) {
    return failure(err, 'disableFailed');
  }
}

export async function twoFactorRegenerateAction(): Promise<
  ActionResult<{ recovery_codes: string[] }>
> {
  try {
    const token = await getToken();
    requireToken(token, await jetonManquant());
    const codes = await twoFactorRegenerateRecoveryCodes(token);
    return { ok: true, data: { recovery_codes: codes } };
  } catch (err) {
    return failure(err, 'regenerateFailed');
  }
}

export async function phoneSendOtpAction(
  phone?: string,
): Promise<ActionResult<{ sent: boolean; debug_code?: string }>> {
  try {
    const token = await getToken();
    requireToken(token, await jetonManquant());
    const data = await phoneSendOtp(token, phone);
    return { ok: true, data };
  } catch (err) {
    return failure(err, 'sendOtpFailed');
  }
}

export async function phoneVerifyOtpAction(
  code: string,
): Promise<ActionResult<null>> {
  try {
    const token = await getToken();
    requireToken(token, await jetonManquant());
    await phoneVerifyOtp(token, code);
    return { ok: true, data: null };
  } catch (err) {
    return failure(err, 'invalidOrExpiredCode');
  }
}

export async function listActiveSessionsAction(): Promise<
  ActionResult<ActiveSession[]>
> {
  try {
    const token = await getToken();
    requireToken(token, await jetonManquant());
    const data = await listActiveSessions(token);
    return { ok: true, data };
  } catch (err) {
    return failure(err, 'sessionsFailed');
  }
}

export async function revokeSessionAction(
  sessionId: number,
): Promise<ActionResult<null>> {
  try {
    const token = await getToken();
    requireToken(token, await jetonManquant());
    await revokeSession(token, sessionId);
    return { ok: true, data: null };
  } catch (err) {
    return failure(err, 'revokeSessionFailed');
  }
}
