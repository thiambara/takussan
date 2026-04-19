'use server';

import { ApiError, apiRequest } from '@/lib/api';
import { getToken } from '@/lib/session';
import type {
  BookingRequestPayload,
  ReportPayload,
  VisitRequestPayload,
} from '@/types/visit';

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; status?: number; message: string; errors?: Record<string, string[]> };

function errorFromApi(e: unknown): { status?: number; message: string; errors?: Record<string, string[]> } {
  if (e instanceof ApiError) {
    const data = (e.data ?? {}) as { message?: string; errors?: Record<string, string[]> };
    return {
      status: e.status,
      message: data.message ?? `Erreur (${e.status}).`,
      errors: data.errors,
    };
  }
  return { message: 'Erreur réseau.' };
}

export async function submitPropertyReport(
  slug: string,
  payload: ReportPayload,
): Promise<ActionResult> {
  try {
    await apiRequest(`/api/public/properties/${slug}/report`, {
      method: 'POST',
      body: payload,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, ...errorFromApi(e) };
  }
}

export async function submitVisitRequest(
  slug: string,
  payload: VisitRequestPayload,
): Promise<ActionResult> {
  const token = await getToken();
  try {
    await apiRequest(`/api/public/properties/${slug}/visit-request`, {
      method: 'POST',
      body: payload,
      token,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, ...errorFromApi(e) };
  }
}

export async function submitBookingRequest(
  slug: string,
  payload: BookingRequestPayload,
): Promise<ActionResult> {
  const token = await getToken();
  if (!token) return { ok: false, status: 401, message: 'Authentification requise.' };
  try {
    await apiRequest(`/api/public/properties/${slug}/booking-request`, {
      method: 'POST',
      body: payload,
      token,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, ...errorFromApi(e) };
  }
}

export async function submitContactMessage(
  slug: string,
  message: string,
): Promise<ActionResult<{ conversation_id: number; redirect_to: string }>> {
  const token = await getToken();
  if (!token) return { ok: false, status: 401, message: 'Authentification requise.' };
  try {
    const res = await apiRequest<{ data: { conversation_id: number; redirect_to: string } }>(
      `/api/public/properties/${slug}/contact-message`,
      { method: 'POST', body: { message }, token },
    );
    return { ok: true, data: res.data };
  } catch (e) {
    return { ok: false, ...errorFromApi(e) };
  }
}

export async function submitReview(
  propertyId: number,
  payload: { rating: number; title?: string; content?: string },
): Promise<ActionResult> {
  const token = await getToken();
  if (!token) return { ok: false, status: 401, message: 'Authentification requise.' };
  try {
    await apiRequest(`/api/properties/${propertyId}/reviews`, {
      method: 'POST',
      body: payload,
      token,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, ...errorFromApi(e) };
  }
}

export async function reportReview(
  reviewId: number,
  reason: string,
): Promise<ActionResult> {
  const token = await getToken();
  if (!token) return { ok: false, status: 401, message: 'Authentification requise.' };
  try {
    await apiRequest(`/api/reviews/${reviewId}/report`, {
      method: 'POST',
      body: { reason },
      token,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, ...errorFromApi(e) };
  }
}

export async function toggleFavoriteAction(
  propertyId: number,
  currentFavoriteId: number | null,
): Promise<ActionResult<{ favorite_id: number | null }>> {
  const token = await getToken();
  if (!token) return { ok: false, status: 401, message: 'Authentification requise.' };
  try {
    if (currentFavoriteId) {
      await apiRequest(`/api/favorites/${currentFavoriteId}`, { method: 'DELETE', token });
      return { ok: true, data: { favorite_id: null } };
    }
    const res = await apiRequest<{ data: { id: number } }>(`/api/favorites`, {
      method: 'POST',
      body: { property_id: propertyId },
      token,
    });
    return { ok: true, data: { favorite_id: res.data.id } };
  } catch (e) {
    return { ok: false, ...errorFromApi(e) };
  }
}
