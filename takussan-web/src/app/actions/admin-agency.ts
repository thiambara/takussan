'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';

import { ApiError, messageErreurApi } from '@/lib/api';
import { getActiveProfileId, getToken } from '@/lib/session';
import {
  fetchAgency,
  regenerateAgencyWatermarks,
  updateAgency,
  uploadAgencyLogo,
  type RegenerateWatermarksResult,
} from '@/lib/queries/agencies';
import { validateAgencyLogoFile, type AgencyFormPayload } from '@/lib/schemas/agency';
import { traduireMessageValidation, type Traducteur } from '@/lib/schemas/messages';
import type { Agency } from '@/types/agency';

/**
 * Admin agency-config server actions — TCK-064.
 */

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; status?: number; message: string; errors?: Record<string, string[]> };

async function mapError(e: unknown): Promise<{
  status?: number;
  message: string;
  errors?: Record<string, string[]>;
}> {
  // `messageErreurApi` compose le CODE de l'erreur avec un traducteur que CE contexte sait
  // obtenir. Ce module est `'use server'` : `getTranslations` de `next-intl/server` est la seule
  // primitive correcte ici. Lire `e.displayMessage` seul rendait la clé i18n brute à l'écran.
  const [tRacine, t] = await Promise.all([
    getTranslations(),
    getTranslations('serverActions.shared'),
  ]);
  const repli = t('networkErrorRetry');
  if (e instanceof ApiError) {
    return {
      status: e.status,
      message: messageErreurApi(e, tRacine, repli),
      errors: e.validationErrors,
    };
  }
  return { message: repli };
}

async function requireToken(): Promise<
  { ok: true; token: string } | { ok: false; result: ActionResult<never> }
> {
  const token = await getToken();
  if (!token) {
    const t = await getTranslations('serverActions.shared');
    return {
      ok: false,
      result: { ok: false, status: 401, message: t('authRequired') },
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
    return { ok: false, ...(await mapError(e)) };
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
    return { ok: false, ...(await mapError(e)) };
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
    const t = await getTranslations('serverActions.shared');
    return { ok: false, message: t('noFileSelected') };
  }
  const validationError = validateAgencyLogoFile(file);
  if (validationError) {
    // `validateAgencyLogoFile` rend une CLÉ (`validation.agency.…`), pas un libellé. Ce module est
    // `'use server'` : `getTranslations()` de `next-intl/server` est la seule primitive correcte
    // ici (ADR-0019). Sans cette résolution, le client afficherait la clé brute — c'est le défaut
    // EXACT qu'ADR-0019 a été écrite pour fermer (TCK-292, 2026-08-22).
    const tRacine = await getTranslations();
    return {
      ok: false,
      message: traduireMessageValidation(validationError, tRacine as unknown as Traducteur),
    };
  }
  try {
    const data = await uploadAgencyLogo(auth.token, agencyId, file, await getActiveProfileId());
    revalidatePath('/admin/agency');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

/**
 * TCK-370 — le geste que le produit avait déjà payé et qu'aucun bouton n'appelait.
 *
 * Pas de `revalidatePath` : le contrôleur rend 202 et le travail part en file. Rien n'a changé
 * à l'instant du retour, et invalider le cache ici ferait croire le contraire.
 */
export async function regenerateAgencyWatermarksAction(
  agencyId: number,
): Promise<ActionResult<RegenerateWatermarksResult>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await regenerateAgencyWatermarks(
      auth.token,
      agencyId,
      await getActiveProfileId(),
    );
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}
