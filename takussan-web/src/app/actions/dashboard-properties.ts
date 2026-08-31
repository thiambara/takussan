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
  fetchPropertyMedia,
  reorderPropertyMedia,
  setPropertyTags,
  updateProperty,
  updatePropertyStatus,
  updatePropertyVisibility,
  uploadPropertyPhotos,
  type PropertyMediaItem,
  assignPropertyAgent,
} from '@/lib/queries/properties-server';
import type {
  PropertyCreatePayload,
  PropertyUpdatePayload,
} from '@/components/property-form/payload';
import type { PropertyDetail } from '@/types/property';

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

export async function assignPropertyAgentAction(
  propertyId: number,
  userId: number,
): Promise<ActionResult<PropertyDetail>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await assignPropertyAgent(auth.token, propertyId, userId);
    revalidatePath('/app/properties');
    revalidatePath(`/app/properties/${propertyId}`);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
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
