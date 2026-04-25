'use server';

import { ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import {
  cancelAccountDeletion,
  getAccountDeletionRequest,
  requestAccountDeletion,
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

function requireToken(token: string | null | undefined): asserts token is string {
  if (!token) throw new ApiError(401, { message: 'Not authenticated.' });
}

function failure(err: unknown, fallback: string): { ok: false; message: string; obligations?: AccountDeletionObligation[]; errors?: Record<string, string[]> } {
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
      message: data?.message ?? err.displayMessage ?? fallback,
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
    requireToken(token);
    const data = await getAccountDeletionRequest(token);
    return { ok: true, data };
  } catch (err) {
    return failure(err, 'Impossible de récupérer la demande de suppression.');
  }
}

export async function requestAccountDeletionAction(
  payload: RequestAccountDeletionPayload,
): Promise<ActionResult<AccountDeletionRequest>> {
  try {
    const token = await getToken();
    requireToken(token);
    const data = await requestAccountDeletion(token, payload);
    return { ok: true, data };
  } catch (err) {
    return failure(err, 'Impossible de soumettre la demande de suppression.');
  }
}

export async function cancelAccountDeletionAction(): Promise<ActionResult<null>> {
  try {
    const token = await getToken();
    requireToken(token);
    await cancelAccountDeletion(token);
    return { ok: true, data: null };
  } catch (err) {
    return failure(err, "Impossible d'annuler la demande de suppression.");
  }
}
