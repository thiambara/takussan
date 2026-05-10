'use server';

import { ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
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

function requireToken(token: string | null | undefined): asserts token is string {
  if (!token) throw new ApiError(401, { message: 'Not authenticated.' });
}

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

function failure(err: unknown, fallback: string): { ok: false; message: string } {
  if (err instanceof ApiError) {
    return { ok: false, message: err.displayMessage || fallback };
  }
  return { ok: false, message: fallback };
}

export async function superAdminTwoFactorEnrollAction(): Promise<
  ActionResult<SuperAdminTwoFactorEnrollResponse>
> {
  try {
    const token = await getToken();
    requireToken(token);
    const data = await superAdminTwoFactorEnroll(token);
    return { ok: true, data };
  } catch (err) {
    return failure(err, "Impossible d'initialiser la 2FA super-admin.");
  }
}

export async function superAdminTwoFactorConfirmAction(
  code: string,
): Promise<ActionResult<SuperAdminTwoFactorConfirmResponse>> {
  try {
    const token = await getToken();
    requireToken(token);
    const data = await superAdminTwoFactorConfirm(token, code);
    return { ok: true, data };
  } catch (err) {
    return failure(err, 'Code TOTP invalide.');
  }
}
