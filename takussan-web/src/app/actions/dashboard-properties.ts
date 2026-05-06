'use server';

import { revalidatePath } from 'next/cache';
import { ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import {
  createProperty,
  deleteProperty,
  deletePropertyMedia,
  fetchPropertyMedia,
  reorderPropertyMedia,
  setPropertyAddress,
  setPropertyTags,
  updateProperty,
  updatePropertyStatus,
  updatePropertyVisibility,
  uploadPropertyPhotos,
  type PropertyAddressPayload,
  type PropertyMediaItem,
} from '@/lib/queries/properties-server';
import type { PropertyFormPayload } from '@/lib/schemas/property';
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
  if (e instanceof Error) {
    console.error(
      `[dashboard-properties.action] ${e.name}: ${e.message}\ncause=${String(e.cause ?? 'none')}\n${e.stack ?? ''}`,
    );
  } else {
    console.error('[dashboard-properties.action] non-Error:', String(e));
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

export async function createPropertyAction(
  payload: PropertyFormPayload,
): Promise<ActionResult<PropertyDetail>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await createProperty(auth.token, payload);
    revalidatePath('/app/properties');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...mapError(e) };
  }
}

export async function updatePropertyAction(
  propertyId: number,
  payload: PropertyFormPayload,
): Promise<ActionResult<PropertyDetail>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await updateProperty(auth.token, propertyId, payload);
    revalidatePath('/app/properties');
    revalidatePath(`/app/properties/${propertyId}`);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...mapError(e) };
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
    return { ok: false, ...mapError(e) };
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
    return { ok: false, ...mapError(e) };
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
    return { ok: false, ...mapError(e) };
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
    return { ok: false, message: 'Aucune photo sélectionnée.' };
  }
  try {
    await uploadPropertyPhotos(auth.token, propertyId, files);
    revalidatePath(`/app/properties/${propertyId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, ...mapError(e) };
  }
}

/**
 * TCK-120 — upsert the address (street, GPS, etc.) for a property.
 */
export async function setPropertyAddressAction(
  propertyId: number,
  data: PropertyAddressPayload,
): Promise<ActionResult> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    await setPropertyAddress(auth.token, propertyId, data);
    revalidatePath(`/app/properties/${propertyId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, ...mapError(e) };
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
    return { ok: false, ...mapError(e) };
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
    return { ok: false, ...mapError(e) };
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
    return { ok: false, ...mapError(e) };
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
    return { ok: false, ...mapError(e) };
  }
}
