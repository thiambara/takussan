'use server';

import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api';
import { getActiveProfileId, getToken } from '@/lib/session';
import {
  fetchAgency,
  updateAgency,
  uploadAgencyLogo,
} from '@/lib/queries/agencies';
import { validateAgencyLogoFile, type AgencyFormPayload } from '@/lib/schemas/agency';
import type { Agency } from '@/types/agency';

/**
 * Admin agency-config server actions — TCK-064.
 */

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; status?: number; message: string; errors?: Record<string, string[]> };

function mapError(e: unknown): {
  status?: number;
  message: string;
  errors?: Record<string, string[]>;
} {
  if (e instanceof ApiError) {
    return {
      status: e.status,
      message: e.displayMessage,
      errors: e.validationErrors,
    };
  }
  return { message: 'Erreur réseau. Réessayez.' };
}

async function requireToken(): Promise<
  { ok: true; token: string } | { ok: false; result: ActionResult<never> }
> {
  const token = await getToken();
  if (!token) {
    return {
      ok: false,
      result: { ok: false, status: 401, message: 'Authentification requise.' },
    };
  }
  return { ok: true, token };
}

export async function fetchAgencyAction(
  agencyId: number,
): Promise<ActionResult<Agency>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await fetchAgency(auth.token, agencyId, await getActiveProfileId());
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...mapError(e) };
  }
}

export async function updateAgencyAction(
  agencyId: number,
  payload: AgencyFormPayload,
): Promise<ActionResult<Agency>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await updateAgency(auth.token, agencyId, payload, await getActiveProfileId());
    revalidatePath('/admin/agency');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...mapError(e) };
  }
}

export async function uploadAgencyLogoAction(
  agencyId: number,
  formData: FormData,
): Promise<ActionResult<Agency>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'Aucun fichier sélectionné.' };
  }
  const validationError = validateAgencyLogoFile(file);
  if (validationError) {
    return { ok: false, message: validationError };
  }
  try {
    const data = await uploadAgencyLogo(auth.token, agencyId, file, await getActiveProfileId());
    revalidatePath('/admin/agency');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...mapError(e) };
  }
}
