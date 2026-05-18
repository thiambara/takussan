import { apiRequest } from './api';

/**
 * TCK-257 — wire types & helpers for the post-acceptance Owner
 * onboarding wizard.
 *
 * The wizard talks to four backend endpoints:
 *  1. POST /api/me/owner-profiles/{id}/kyc/upload    — multipart CNI/RIB/NINEA
 *  2. POST /api/me/owner-profiles/{id}/kyc/submit    — flips KYC to pending_review
 *  3. POST /api/owner/onboard/complete                — OTP + flip status + cookie
 *  4. GET  /api/me/owner-profiles/{id}/properties    — pre-attached properties
 */

export type OwnerKycSubmitResponse = {
  data: {
    id: number;
    kyc: {
      status: string;
      submitted_at: string | null;
      docs: string[];
    };
  };
};

export type OwnerOnboardCompletePayload = {
  owner_profile_id: number;
  phone_otp?: { code: string };
};

export type OwnerOnboardCompleteResponse = {
  data: {
    owner_profile: { id: number; status: string };
    active_profile_id: string;
    properties_count: number;
  };
};

export type OwnerPropertyEntry = {
  id: number;
  title?: string | null;
  city?: string | null;
  price?: number | string | null;
  thumbnail_url?: string | null;
  status?: string | null;
  type?: string | null;
};

export type OwnerPropertiesResponse = {
  data: OwnerPropertyEntry[];
  meta: {
    total: number;
    current_page: number;
    last_page: number;
    per_page: number;
  };
};

export async function submitOwnerKyc(
  token: string,
  ownerProfileId: number,
): Promise<OwnerKycSubmitResponse> {
  return apiRequest<OwnerKycSubmitResponse>(
    `/api/me/owner-profiles/${ownerProfileId}/kyc/submit`,
    { method: 'POST', token },
  );
}

export async function completeOwnerOnboarding(
  token: string,
  payload: OwnerOnboardCompletePayload,
): Promise<OwnerOnboardCompleteResponse> {
  return apiRequest<OwnerOnboardCompleteResponse>(
    '/api/owner/onboard/complete',
    { method: 'POST', token, body: payload },
  );
}

export async function fetchOwnerProperties(
  token: string,
  ownerProfileId: number,
  query = 'fields[properties]=id,title,price,status,type',
): Promise<OwnerPropertiesResponse> {
  const qs = query ? `?${query}` : '';
  return apiRequest<OwnerPropertiesResponse>(
    `/api/me/owner-profiles/${ownerProfileId}/properties${qs}`,
    { token },
  );
}
