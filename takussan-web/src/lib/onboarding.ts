import { apiRequest } from './api';

/**
 * TCK-255 — Wire payload for `POST /api/host/individual/onboard`.
 * Mirrors `App\Http\Requests\Onboarding\HostIndividualOnboardRequest`.
 */
export type HostIndividualOnboardPayload = {
  agency: { name: string; primary_city: string; currency: string };
  phone_otp: { phone: string; code: string };
  preferences: { primary_property_type: string };
  first_property_draft: {
    title: string;
    type: string;
    city: string;
    contract_type: 'rent' | 'sale';
    price: number;
  };
  payment_setting: { preferred_provider: string };
  cgu_accepted: boolean;
};

export type HostIndividualOnboardResponse = {
  data: {
    agency: { id: number; name: string; slug: string; kind: string; status: string };
    profiles: {
      agency_admin: { role: 'agency_admin'; agency_id: number };
      owner: { id: number; agency_id: number; status: string };
    };
    property_draft: { id: number; slug: string; status: string; visibility: string };
    active_profile_id: string;
  };
};

export async function hostIndividualOnboard(
  token: string,
  payload: HostIndividualOnboardPayload,
): Promise<HostIndividualOnboardResponse> {
  return apiRequest<HostIndividualOnboardResponse>('/api/host/individual/onboard', {
    method: 'POST',
    token,
    body: payload,
  });
}
