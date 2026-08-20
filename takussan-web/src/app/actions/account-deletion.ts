'use server';

import { ApiError, messageErreurApi } from '@/lib/api';
import { getToken } from '@/lib/session';
import { getTranslations } from 'next-intl/server';
import {
  cancelAccountDeletion,
  getAccountDeletionRequest,
  requestAccountDeletion,
  sendAccountDeletionStepUpCode,
  type AccountDeletionObligation,
  type AccountDeletionRequest,
  type RequestAccountDeletionPayload,
} from '@/lib/account-deletion';

/**
 * TCK-080 — server-action wrappers for the deletion lifecycle. All return
 * an `{ ok, ... }` envelope so the SPA can render error/obligations UI
 * without bubbling exceptions across the RSC boundary.
 */

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; obligations?: AccountDeletionObligation[]; errors?: Record<string, string[]> };

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

/** Clés de repli de `serverActions.accountDeletion`. */
type CleRepli = 'loadFailed' | 'submitFailed' | 'sendCodeFailed' | 'cancelFailed';

async function failure(err: unknown, cleRepli: CleRepli): Promise<{ ok: false; message: string; obligations?: AccountDeletionObligation[]; errors?: Record<string, string[]> }> {
  const t = await getTranslations('serverActions.accountDeletion');
  const fallback = t(cleRepli);
  if (err instanceof ApiError) {
    const data = err.data as
      | {
          message?: string;
          obligations?: AccountDeletionObligation[];
          errors?: Record<string, string[]>;
        }
      | undefined;
    return {
      ok: false,
      // `data?.message` pouvait être la sentinelle anglaise « Unauthenticated. » de Laravel, et
      // `err.displayMessage` la CLÉ i18n : `messageErreurApi` écarte les deux.
      message: messageErreurApi(err, await getTranslations(), fallback),
      obligations: data?.obligations,
      errors: data?.errors,
    };
  }
  return { ok: false, message: fallback };
}

export async function getAccountDeletionRequestAction(): Promise<
  ActionResult<AccountDeletionRequest | null>
> {
  try {
    const token = await getToken();
    requireToken(token, await jetonManquant());
    const data = await getAccountDeletionRequest(token);
    return { ok: true, data };
  } catch (err) {
    return failure(err, 'loadFailed');
  }
}

export async function requestAccountDeletionAction(
  payload: RequestAccountDeletionPayload,
): Promise<ActionResult<AccountDeletionRequest>> {
  try {
    const token = await getToken();
    requireToken(token, await jetonManquant());
    const data = await requestAccountDeletion(token, payload);
    return { ok: true, data };
  } catch (err) {
    return failure(err, 'submitFailed');
  }
}

/**
 * TCK-272 — émission du code de step-up par e-mail, pour les comptes sans
 * mot de passe utilisable.
 */
export async function sendAccountDeletionStepUpCodeAction(): Promise<ActionResult<null>> {
  try {
    const token = await getToken();
    requireToken(token, await jetonManquant());
    await sendAccountDeletionStepUpCode(token);
    return { ok: true, data: null };
  } catch (err) {
    return failure(err, 'sendCodeFailed');
  }
}

export async function cancelAccountDeletionAction(): Promise<ActionResult<null>> {
  try {
    const token = await getToken();
    requireToken(token, await jetonManquant());
    await cancelAccountDeletion(token);
    return { ok: true, data: null };
  } catch (err) {
    return failure(err, 'cancelFailed');
  }
}
