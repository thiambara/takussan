import { apiRequest } from './api';

/**
 * TCK-261 — wire types & helpers for the post-acceptance Service Provider
 * onboarding wizard.
 *
 * The wizard talks to four backend endpoints:
 *  1. PATCH /api/me/profiles/{sp}/trades        — métiers + zones + tarifs
 *  2. PATCH /api/me/profiles/{sp}/availability  — créneaux hebdo
 *  3. POST  /api/me/profiles/{sp}/kyc/upload    — multipart CNI / assurance
 *  4. POST  /api/service-provider/onboard/complete — OTP + flip status
 *
 * The `complete` endpoint also pins the `active_profile_id` cookie via
 * the server action layer — see `serviceProviderOnboardingCompleteAction`.
 */

export type AvailabilitySlot = {
  day:
    | 'monday'
    | 'tuesday'
    | 'wednesday'
    | 'thursday'
    | 'friday'
    | 'saturday'
    | 'sunday';
  from: string; // 'HH:mm'
  to: string; // 'HH:mm'
};

export type TradesPayload = {
  trades: string[];
  intervention_zones: string[];
  hourly_rate: number | null;
  visit_fee: number | null;
};

export type TradesResponse = {
  data: {
    id: number;
    trades: string[];
    intervention_zones: string[];
    hourly_rate: number | string | null;
    visit_fee: number | null;
  };
};

export type AvailabilityResponse = {
  data: {
    id: number;
    available_slots: AvailabilitySlot[];
  };
};

export type KycUploadResponse = {
  data: {
    id: number;
    kind: 'cni' | 'insurance';
    type: string;
    media_id: number;
    file_name: string;
    uploaded_at: string | null;
  };
};

export type OnboardCompletePayload = {
  sp_profile_id: number;
  phone_otp?: { code: string };
};

export type OnboardCompleteResponse = {
  data: {
    sp_profile: { id: number; status: string };
    active_profile_id: string;
    activated_collaborations: number;
    redirect_to_maintenance_request_id: number | null;
  };
};

export async function patchSpTrades(
  token: string,
  spProfileId: number,
  payload: TradesPayload,
): Promise<TradesResponse> {
  return apiRequest<TradesResponse>(`/api/me/profiles/${spProfileId}/trades`, {
    method: 'PATCH',
    token,
    body: payload,
  });
}

export async function patchSpAvailability(
  token: string,
  spProfileId: number,
  payload: { available_slots: AvailabilitySlot[] },
): Promise<AvailabilityResponse> {
  return apiRequest<AvailabilityResponse>(
    `/api/me/profiles/${spProfileId}/availability`,
    { method: 'PATCH', token, body: payload },
  );
}

export async function uploadSpKyc(
  token: string,
  spProfileId: number,
  file: File,
  kind: 'cni' | 'insurance',
): Promise<KycUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('kind', kind);

  return apiRequest<KycUploadResponse>(
    `/api/me/profiles/${spProfileId}/kyc/upload`,
    { method: 'POST', token, body: formData, formData: true },
  );
}

export async function completeSpOnboarding(
  token: string,
  payload: OnboardCompletePayload,
): Promise<OnboardCompleteResponse> {
  return apiRequest<OnboardCompleteResponse>(
    '/api/service-provider/onboard/complete',
    { method: 'POST', token, body: payload },
  );
}

/**
 * TCK-262 — agences avec lesquelles le SP authentifié collabore
 * (cross-agences). Consommé par le menu "switch agence" du SP et par le
 * gating "afficher le wizard ou la page Bienvenue" sur la landing
 * post-acceptation.
 */
export type ServiceProviderAgencyEntry = {
  collaboration_id: number;
  agency_id: number;
  agency: {
    id: number;
    name: string;
    slug: string;
    kind: string | null;
    status: string | null;
  };
  status: string | null;
  started_at: string | null;
  ended_at: string | null;
};

export type ServiceProviderAgenciesResponse = {
  data: ServiceProviderAgencyEntry[];
  meta: {
    total: number;
    service_provider_profile_id: number | null;
  };
};

export async function fetchSpAgencies(
  token: string,
): Promise<ServiceProviderAgenciesResponse> {
  return apiRequest<ServiceProviderAgenciesResponse>(
    '/api/me/service-provider/agencies',
    { token },
  );
}
