'use server';

import { ApiError, apiRequest, messageErreurApi } from '@/lib/api';
import { getToken } from '@/lib/session';
import { getTranslations } from 'next-intl/server';
import type {
  BookingRequestPayload,
  OfferRequestPayload,
  ReportPayload,
  VisitRequestPayload,
} from '@/types/visit';

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; status?: number; message: string; errors?: Record<string, string[]> };

async function errorFromApi(
  e: unknown,
): Promise<{ status?: number; message: string; errors?: Record<string, string[]> }> {
  const [tRacine, t] = await Promise.all([
    getTranslations(),
    getTranslations('serverActions.properties'),
  ]);
  if (e instanceof ApiError) {
    const data = (e.data ?? {}) as { message?: string; errors?: Record<string, string[]> };
    return {
      status: e.status,
      // ⚠️ C'était `data.message ?? t('apiError', …)`, et `data.message` relayait TEL QUEL le
      // « Unauthenticated. » anglais de Laravel — le cas le plus fréquent d'un 401. Le repli
      // `Erreur (404).` est un gabarit interpolé, donc invisible au scanner de check-i18n ;
      // il s'affichait bien (TCK-292, lot K).
      message: messageErreurApi(e, tRacine, t('apiError', { status: String(e.status) })),
      errors: data.errors,
    };
  }
  return { message: t('networkError') };
}

/** Le jeton manque : aucune requête n'est partie. */
async function authRequise(): Promise<ActionResult<never>> {
  const t = await getTranslations('serverActions.shared');
  return { ok: false, status: 401, message: t('authRequired') };
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
    return { ok: false, ...(await errorFromApi(e)) };
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
    return { ok: false, ...(await errorFromApi(e)) };
  }
}

export async function submitBookingRequest(
  slug: string,
  payload: BookingRequestPayload,
): Promise<ActionResult> {
  const token = await getToken();
  if (!token) return authRequise();
  try {
    await apiRequest(`/api/public/properties/${slug}/booking-request`, {
      method: 'POST',
      body: payload,
      token,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, ...(await errorFromApi(e)) };
  }
}

/**
 * TCK-180 — review eligibility for the connected user on a given property.
 * Anonymous → returns `{ eligible: false, alreadyReviewed: false }` without
 * calling the backend (the route is gated by sanctum).
 */
export async function getReviewEligibility(
  slug: string,
): Promise<{ eligible: boolean; alreadyReviewed: boolean }> {
  const token = await getToken();
  if (!token) return { eligible: false, alreadyReviewed: false };
  try {
    const res = await apiRequest<{
      data: { eligible: boolean; reason: string; already_reviewed: boolean };
    }>(`/api/public/properties/${encodeURIComponent(slug)}/review-eligibility`, {
      token,
    });
    return {
      eligible: !!res.data.eligible,
      alreadyReviewed: !!res.data.already_reviewed,
    };
  } catch {
    return { eligible: false, alreadyReviewed: false };
  }
}

/**
 * TCK-176 — purchase-offer submission. Same endpoint as
 * `submitBookingRequest`, but with the offer payload (no dates / guests).
 * Backend branches on `Property.contract_type === 'sale'`.
 */
export async function submitPurchaseOffer(
  slug: string,
  payload: OfferRequestPayload,
): Promise<ActionResult> {
  const token = await getToken();
  if (!token) return authRequise();
  try {
    await apiRequest(`/api/public/properties/${slug}/booking-request`, {
      method: 'POST',
      body: payload,
      token,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, ...(await errorFromApi(e)) };
  }
}

export async function submitContactMessage(
  slug: string,
  message: string,
): Promise<ActionResult<{ conversation_id: number; redirect_to: string }>> {
  const token = await getToken();
  if (!token) return authRequise();
  try {
    const res = await apiRequest<{ data: { conversation_id: number; redirect_to: string } }>(
      `/api/public/properties/${slug}/contact-message`,
      { method: 'POST', body: { message }, token },
    );
    return { ok: true, data: res.data };
  } catch (e) {
    return { ok: false, ...(await errorFromApi(e)) };
  }
}

/**
 * TCK-161 — anonymous lead capture. Public endpoint, no auth required.
 * The `company` field is a honeypot; bots fill all visible inputs and
 * the backend silently accepts but skips persistence when it's not empty.
 */
export async function submitContactLead(
  slug: string,
  payload: { name: string; email: string; phone?: string; message: string; company?: string },
): Promise<ActionResult> {
  try {
    await apiRequest(`/api/public/properties/${slug}/contact-lead`, {
      method: 'POST',
      body: payload,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, ...(await errorFromApi(e)) };
  }
}

export async function submitReview(
  propertyId: number,
  payload: { rating: number; title?: string; content?: string },
): Promise<ActionResult> {
  const token = await getToken();
  if (!token) return authRequise();
  try {
    await apiRequest(`/api/properties/${propertyId}/reviews`, {
      method: 'POST',
      body: payload,
      token,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, ...(await errorFromApi(e)) };
  }
}

export async function reportReview(
  reviewId: number,
  reason: string,
): Promise<ActionResult> {
  const token = await getToken();
  if (!token) return authRequise();
  try {
    await apiRequest(`/api/reviews/${reviewId}/report`, {
      method: 'POST',
      body: { reason },
      token,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, ...(await errorFromApi(e)) };
  }
}

/**
 * Post (or overwrite) the public reply on a review. Backend exposes a single
 * `POST /api/reviews/{review}/reply` endpoint that performs an upsert — we
 * reuse it for both initial post and edit (see TCK-073 notes).
 */
export async function submitReviewReply(
  reviewId: number,
  replyContent: string,
): Promise<ActionResult> {
  const token = await getToken();
  if (!token) return authRequise();
  try {
    await apiRequest(`/api/reviews/${reviewId}/reply`, {
      method: 'POST',
      body: { reply_content: replyContent },
      token,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, ...(await errorFromApi(e)) };
  }
}

export async function toggleFavoriteAction(
  propertyId: number,
  currentFavoriteId: number | null,
): Promise<ActionResult<{ favorite_id: number | null }>> {
  const token = await getToken();
  if (!token) return authRequise();
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
    return { ok: false, ...(await errorFromApi(e)) };
  }
}
