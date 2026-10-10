'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { ApiError, messageErreurApi } from '@/lib/api';
import { getToken } from '@/lib/session';
import {
  createProperty,
  deleteProperty,
  deletePropertyMedia,
  duplicateProperty,
  fetchListingQuota,
  fetchPropertyMedia,
  reorderPropertyMedia,
  setPropertyTags,
  updateProperty,
  updatePropertyStatus,
  updatePropertyVisibility,
  uploadPropertyPhotos,
  type ListingQuota,
  type PropertyMediaItem,
} from '@/lib/queries/properties-server';
import type {
  PropertyCreatePayload,
  PropertyUpdatePayload,
} from '@/components/property-form/payload';
import type { PropertyDetail } from '@/types/property';
import { bulkPropertyArchive, bulkPropertyAssign, bulkPropertyVisibility } from '@/lib/queries/agent-crm';
import type { BulkResult } from '@/types/agent-crm';

/**
 * Dashboard Agent — server actions wrapping the property CRUD mutations
 * (TCK-041). All calls require a Sanctum token from the auth cookie; we
 * forward 422 validation details back to the client so the forms can map
 * them onto their fields via `useApiForm`.
 */

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | {
      ok: false;
      status?: number;
      message: string;
      errors?: Record<string, string[]>;
    };

async function mapError(e: unknown): Promise<{
  status?: number;
  message: string;
  errors?: Record<string, string[]>;
}> {
  // cf. `admin-agency.ts` — un module `'use server'` traduit avec `getTranslations`, jamais
  // en lisant un libellé pré-calculé sur l'objet d'erreur.
  const tRacine = await getTranslations();
  if (e instanceof ApiError) {
    const t = await getTranslations('serverActions.shared');
    return {
      status: e.status,
      message: messageErreurApi(e, tRacine, t('networkErrorRetry')),
      errors: e.validationErrors,
    };
  }
  if (e instanceof Error) {
    console.error(
      `[dashboard-properties.action] ${e.name}: ${e.message}\ncause=${String(e.cause ?? 'none')}\n${e.stack ?? ''}`,
    );
  } else {
    console.error('[dashboard-properties.action] non-Error:', String(e));
  }
  const t = await getTranslations('serverActions.shared');
  return { message: t('networkErrorRetry') };
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

export async function createPropertyAction(
  payload: PropertyCreatePayload,
): Promise<ActionResult<PropertyDetail>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await createProperty(auth.token, payload);
    revalidatePath('/app/properties');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

export async function updatePropertyAction(
  propertyId: number,
  payload: PropertyUpdatePayload,
): Promise<ActionResult<PropertyDetail>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await updateProperty(auth.token, propertyId, payload);
    revalidatePath('/app/properties');
    revalidatePath(`/app/properties/${propertyId}`);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

export async function deletePropertyAction(
  propertyId: number,
): Promise<ActionResult> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    await deleteProperty(auth.token, propertyId);
    revalidatePath('/app/properties');
    return { ok: true };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

export async function duplicatePropertyAction(
  propertyId: number,
): Promise<ActionResult<PropertyDetail>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await duplicateProperty(auth.token, propertyId);
    revalidatePath('/app/properties');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

export async function updatePropertyStatusAction(
  propertyId: number,
  status: string,
): Promise<ActionResult<PropertyDetail>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await updatePropertyStatus(auth.token, propertyId, status);
    revalidatePath('/app/properties');
    revalidatePath(`/app/properties/${propertyId}`);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

/**
 * TCK-627 — le quota d'annonces, lu AVANT l'assistant : une limite atteinte se dit à l'entrée,
 * pas par un 422 après six étapes. Un échec de lecture rend `null` — l'assistant s'ouvre, et
 * la publication contrôlera de toute façon (`PropertyController::publish`).
 */
export async function fetchListingQuotaAction(): Promise<ListingQuota | null> {
  const auth = await requireToken();
  if (!auth.ok) return null;
  try {
    return await fetchListingQuota(auth.token);
  } catch {
    return null;
  }
}

export async function updatePropertyVisibilityAction(
  propertyId: number,
  visibility: 'public' | 'private',
): Promise<ActionResult<PropertyDetail>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await updatePropertyVisibility(
      auth.token,
      propertyId,
      visibility,
    );
    revalidatePath('/app/properties');
    revalidatePath(`/app/properties/${propertyId}`);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

/**
 * TCK-591 §7 — archiver / dépublier en UN appel : l'API autorise ligne à ligne et rend un bilan
 * (`updated`, `updated_ids`, `failed[{id, reason}]`). La boucle d'appels unitaires qu'elle remplace
 * s'arrêtait au premier refus, ne disait que lui, et laissait la sélection entière.
 */
async function runBulk(
  call: (token: string) => Promise<BulkResult>,
): Promise<ActionResult<BulkResult>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await call(auth.token);
    if (data.updated > 0) revalidatePath('/app/properties');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

export async function bulkArchivePropertiesAction(propertyIds: number[]): Promise<ActionResult<BulkResult>> {
  return runBulk((token) => bulkPropertyArchive(token, propertyIds));
}

export async function bulkUnpublishPropertiesAction(propertyIds: number[]): Promise<ActionResult<BulkResult>> {
  return runBulk((token) => bulkPropertyVisibility(token, propertyIds));
}

/** Un identifiant venu du client : un entier positif sûr, rien d'autre. */
const estIdentifiant = (id: unknown): id is number => Number.isSafeInteger(id) && (id as number) > 0;

/**
 * TCK-603 — « Changer l'agent responsable » d'un lot, en UN appel (`bulk-assign`) : la cible devient
 * l'agent principal de chaque bien, le propriétaire ne change jamais (ADR-0036). Les identifiants
 * viennent du client : hors d'entiers positifs, rien ne part.
 */
export async function bulkAssignPropertiesAction(
  propertyIds: number[],
  userId: number,
): Promise<ActionResult<BulkResult>> {
  if (!Array.isArray(propertyIds) || propertyIds.length === 0 || !propertyIds.every(estIdentifiant) || !estIdentifiant(userId)) {
    const t = await getTranslations('property.dashboard.list');
    return { ok: false, status: 422, message: t('bulkError') };
  }
  return runBulk((token) => bulkPropertyAssign(token, propertyIds, userId));
}

export async function uploadPropertyPhotosAction(
  propertyId: number,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  const files = formData.getAll('photos').filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    const t = await getTranslations('serverActions.properties');
    return { ok: false, message: t('noPhotoSelected') };
  }
  try {
    await uploadPropertyPhotos(auth.token, propertyId, files);
    revalidatePath(`/app/properties/${propertyId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

/**
 * TCK-120 — sync the amenity tags of a property (full replace).
 */
export async function setPropertyTagsAction(
  propertyId: number,
  tagIds: number[],
): Promise<ActionResult> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    await setPropertyTags(auth.token, propertyId, tagIds);
    return { ok: true };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

/**
 * TCK-071 — list the current media (used by `MediaManager` on mount).
 */
export async function fetchPropertyMediaAction(
  propertyId: number,
): Promise<ActionResult<PropertyMediaItem[]>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await fetchPropertyMedia(auth.token, propertyId);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

/**
 * TCK-071 — delete one media item.
 */
export async function deletePropertyMediaAction(
  propertyId: number,
  mediaId: number,
): Promise<ActionResult> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    await deletePropertyMedia(auth.token, propertyId, mediaId);
    revalidatePath(`/app/properties/${propertyId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

/**
 * TCK-071 — persist a new order. First id = cover photo.
 */
export async function reorderPropertyMediaAction(
  propertyId: number,
  mediaIds: number[],
): Promise<ActionResult> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    await reorderPropertyMedia(auth.token, propertyId, mediaIds);
    revalidatePath(`/app/properties/${propertyId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}
