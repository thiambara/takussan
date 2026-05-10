import { apiRequest } from './api';

/**
 * TCK-259 — wire types & helpers for the post-acceptance Agent
 * onboarding wizard.
 *
 * The wizard talks to four backend endpoints:
 *  1. POST  /api/me/agent-profiles/{id}/kyc/upload         — multipart license/cni/photo
 *  2. POST  /api/me/agent-profiles/{id}/kyc/submit         — flips KYC to pending_review
 *  3. PATCH /api/me/agent-profiles/{id}/specialization     — specialty + zones + license_number
 *  4. GET   /api/me/agent-profiles/{id}/first-lead         — first pre-assigned customer
 *  5. POST  /api/agent/onboard/complete                    — OTP + flip status + cookie
 */

export type AgentKycSubmitResponse = {
  data: {
    id: number;
    kyc: {
      status: string;
      submitted_at: string | null;
      docs: string[];
    };
  };
};

export type AgentSpecializationPayload = {
  specialization: 'residential' | 'commercial' | 'luxury' | 'mixed';
  intervention_zones: string[];
  license_number?: string | null;
};

export type AgentSpecializationResponse = {
  data: {
    id: number;
    specialization: string | null;
    intervention_zones: string[];
    license_number: string | null;
  };
};

export type AgentFirstLeadEntry = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  pipeline_stage: string | null;
};

export type AgentFirstLeadResponse = {
  data: { customer: AgentFirstLeadEntry | null };
};

export type AgentOnboardCompletePayload = {
  agent_profile_id: number;
  phone_otp?: { code: string };
};

export type AgentOnboardCompleteResponse = {
  data: {
    agent_profile: { id: number; status: string };
    active_profile_id: string;
    first_lead: AgentFirstLeadEntry | null;
  };
};

export async function submitAgentKyc(
  token: string,
  agentProfileId: number,
): Promise<AgentKycSubmitResponse> {
  return apiRequest<AgentKycSubmitResponse>(
    `/api/me/agent-profiles/${agentProfileId}/kyc/submit`,
    { method: 'POST', token },
  );
}

export async function patchAgentSpecialization(
  token: string,
  agentProfileId: number,
  payload: AgentSpecializationPayload,
): Promise<AgentSpecializationResponse> {
  return apiRequest<AgentSpecializationResponse>(
    `/api/me/agent-profiles/${agentProfileId}/specialization`,
    { method: 'PATCH', token, body: payload },
  );
}

export async function fetchAgentFirstLead(
  token: string,
  agentProfileId: number,
): Promise<AgentFirstLeadResponse> {
  return apiRequest<AgentFirstLeadResponse>(
    `/api/me/agent-profiles/${agentProfileId}/first-lead`,
    { token },
  );
}

export async function completeAgentOnboarding(
  token: string,
  payload: AgentOnboardCompletePayload,
): Promise<AgentOnboardCompleteResponse> {
  return apiRequest<AgentOnboardCompleteResponse>(
    '/api/agent/onboard/complete',
    { method: 'POST', token, body: payload },
  );
}
