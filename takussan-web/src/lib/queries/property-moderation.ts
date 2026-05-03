import { apiRequest } from '@/lib/api';
import type { PaginatedResponse, ApiResponse } from '@/types/api';

/**
 * Property moderation queries — TCK-098.
 * Admin queue uses filter[search] and per_page.
 */

export interface ModerationPropertyOwner {
  id: number;
  name: string;
  avatar_url: string | null;
}

export interface ModerationPropertyAgency {
  id: number;
  name: string;
}

export interface ModerationProperty {
  id: number;
  reference_number: string;
  title: string;
  slug: string;
  status: string;
  main_photo_url: string | null;
  price: number;
  currency: string | null;
  type: string;
  submitted_at: string | null;
  rejection_reason: string | null;
  owner: ModerationPropertyOwner | null;
  agency: ModerationPropertyAgency | null;
  location: {
    city: string | null;
    region: string | null;
    country: string | null;
  };
}

export interface ModerationQueueMeta {
  total: number;
  current_page: number;
  last_page: number;
  per_page: number;
  pending_count: number;
}

export type ModerationPropertyQueueResponse = PaginatedResponse<ModerationProperty> & {
  meta: ModerationQueueMeta;
};

export interface FetchPropertyModerationQueueParams {
  readonly search?: string;
  readonly page?: number;
  readonly perPage?: number;
}

export async function fetchPropertyModerationQueue(
  token: string,
  params: FetchPropertyModerationQueueParams = {},
): Promise<ModerationPropertyQueueResponse> {
  const qs = new URLSearchParams();
  if (params.search) qs.set('filter[search]', params.search);
  if (params.page) qs.set('page', String(params.page));
  if (params.perPage) qs.set('per_page', String(params.perPage));
  const query = qs.toString();
  return apiRequest<ModerationPropertyQueueResponse>(
    `/api/properties/moderation${query ? `?${query}` : ''}`,
    { token },
  );
}

export interface PropertyModerationResponse {
  data: ModerationProperty;
}

export async function approveProperty(
  propertyId: number,
  token: string,
): Promise<PropertyModerationResponse> {
  return apiRequest<PropertyModerationResponse>(
    `/api/properties/${propertyId}/approve`,
    { method: 'POST', token },
  );
}

export async function rejectProperty(
  propertyId: number,
  rejectionReason: string,
  token: string,
): Promise<PropertyModerationResponse> {
  return apiRequest<PropertyModerationResponse>(
    `/api/properties/${propertyId}/reject`,
    { method: 'POST', body: { rejection_reason: rejectionReason }, token },
  );
}

export async function resubmitProperty(
  propertyId: number,
  token: string,
): Promise<ApiResponse<unknown>> {
  return apiRequest<ApiResponse<unknown>>(
    `/api/properties/${propertyId}/resubmit`,
    { method: 'POST', token },
  );
}
