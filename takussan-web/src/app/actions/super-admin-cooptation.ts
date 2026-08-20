'use server';

import { ApiError, messageErreurApi } from '@/lib/api';
import { getToken } from '@/lib/session';
import { getTranslations } from 'next-intl/server';
import {
  superAdminTwoFactorConfirm,
  superAdminTwoFactorEnroll,
  type SuperAdminTwoFactorConfirmResponse,
  type SuperAdminTwoFactorEnrollResponse,
} from '@/lib/security';

/**
 * TCK-264 — Server-action wrappers for the dedicated super-admin TOTP
 * endpoints. Mirrors `src/app/actions/security.ts` (`{ ok, ... }`
 * envelopes) so the wizard can stash the recovery codes in component
 * state at enroll time and surface them again on confirm without a
 * second round-trip.
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

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

/** Clés de repli de `serverActions.superAdminCooptation`. */
type CleRepli = 'enrollFailed' | 'invalidTotp';

async function failure(err: unknown, cleRepli: CleRepli): Promise<{ ok: false; message: string }> {
  const t = await getTranslations('serverActions.superAdminCooptation');
  const repli = t(cleRepli);
  if (err instanceof ApiError) {
    // ⚠️ C'était `err.displayMessage || repli`, et le repli était MORT : `displayMessage` rendait
    // une clé i18n, et une clé est *truthy*. Un module `'use server'` traduit avec
    // `getTranslations`, jamais en lisant un libellé pré-calculé sur l'erreur.
    return { ok: false, message: messageErreurApi(err, await getTranslations(), repli) };
  }
  return { ok: false, message: repli };
}

export async function superAdminTwoFactorEnrollAction(): Promise<
  ActionResult<SuperAdminTwoFactorEnrollResponse>
> {
  try {
    const token = await getToken();
    requireToken(token, await jetonManquant());
    const data = await superAdminTwoFactorEnroll(token);
    return { ok: true, data };
  } catch (err) {
    return failure(err, 'enrollFailed');
  }
}

export async function superAdminTwoFactorConfirmAction(
  code: string,
): Promise<ActionResult<SuperAdminTwoFactorConfirmResponse>> {
  try {
    const token = await getToken();
    requireToken(token, await jetonManquant());
    const data = await superAdminTwoFactorConfirm(token, code);
    return { ok: true, data };
  } catch (err) {
    return failure(err, 'invalidTotp');
  }
}
