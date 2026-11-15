import { apiRequest } from './api';
import { cheminApi } from '@/lib/chemin-api';

/**
 * TCK-259 — wire types & helpers for the post-acceptance Agent
 * onboarding wizard.
 *
 * The wizard talks to five backend endpoints:
 *  1. POST  /api/me/agent-profiles/{id}/kyc/upload         — multipart license/cni/photo
 *  2. POST  /api/me/agent-profiles/{id}/kyc/submit         — stamps kyc.submitted_at
 *  3. PATCH /api/me/agent-profiles/{id}/specialization     — specialty + zones + license_number
 *  4. GET   /api/me/agent-profiles/{id}/first-lead         — first pre-assigned customer
 *  5. POST  /api/agent/onboard/complete                    — OTP + flip status + cookie
 */

export type AgentKycSubmitResponse = {
  data: {
    id: number;
    kyc: {
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
  // TCK-2945 — la carte complète du premier prospect (projection `AgentFirstLead` de TCK-2942, la même pour
  // `GET …/first-lead` et pour `complete()`). Chaque champ peut être `null` : la carte n'en rend alors pas la ligne.
  need: AgentFirstLeadNeed | null;
  /** Chaînes `decimal:2` (« 300000.00 »), comme `CustomerResource`. */
  budget_min: string | null;
  budget_max: string | null;
  /** Instant ISO. */
  last_contacted_at: string | null;
  last_contact_channel: string | null;
  origin: AgentFirstLeadOrigin | null;
  agency_note: AgentFirstLeadNote | null;
};

/** TCK-2945 — les critères de recherche de la fiche ; `null` côté API quand aucun n'est posé. */
export type AgentFirstLeadNeed = {
  contract_type: 'rent' | 'sale' | string | null;
  property_types: string[];
  cities: string[];
  neighborhoods: string[];
  min_bedrooms: number | null;
};

/** TCK-2945 — d'où vient le prospect : la demande de contact et son bien, sinon le bien d'intérêt. */
export type AgentFirstLeadOrigin = {
  kind: 'contact_lead' | 'interested_property';
  channel: string | null;
  received_at: string | null;
  property_id: number | null;
  property_title: string | null;
  property_reference: string | null;
};

/** TCK-2945 — la note libre de l'agence sur la fiche ; `author_name` nul pour la colonne `customers.notes`. */
export type AgentFirstLeadNote = {
  body: string;
  author_name: string | null;
  created_at: string | null;
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
    cheminApi`/api/me/agent-profiles/${agentProfileId}/kyc/submit`,
    { method: 'POST', token },
  );
}

export async function patchAgentSpecialization(
  token: string,
  agentProfileId: number,
  payload: AgentSpecializationPayload,
): Promise<AgentSpecializationResponse> {
  return apiRequest<AgentSpecializationResponse>(
    cheminApi`/api/me/agent-profiles/${agentProfileId}/specialization`,
    { method: 'PATCH', token, body: payload },
  );
}

export async function fetchAgentFirstLead(
  token: string,
  agentProfileId: number,
): Promise<AgentFirstLeadResponse> {
  return apiRequest<AgentFirstLeadResponse>(
    cheminApi`/api/me/agent-profiles/${agentProfileId}/first-lead`,
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
