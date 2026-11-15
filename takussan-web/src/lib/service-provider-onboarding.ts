import { apiRequest } from './api';
import { cheminApi } from '@/lib/chemin-api';

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
  return apiRequest<TradesResponse>(cheminApi`/api/me/profiles/${spProfileId}/trades`, {
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
    cheminApi`/api/me/profiles/${spProfileId}/availability`,
    { method: 'PATCH', token, body: payload },
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

/**
 * TCK-2613 — la demande d'intervention que l'agence a jointe à l'invitation, lue AVANT la fin d'onboarding
 * (`GET /api/me/profiles/{sp}/intervention-d-origine`, titulaire seul, tant que le lien n'est pas consommé). Une projection minimale :
 * ni l'adresse exacte, ni le demandeur, ni son téléphone — ils ne s'ouvrent qu'après l'acceptation (TCK-592, P6).
 * `data: null` : aucune demande jointe, ou plus à prendre.
 */
export type InterventionDOrigine = {
  readonly id: number;
  readonly title?: string | null;
  readonly category?: string | null;
  readonly place?: { readonly quarter: string | null; readonly city: string | null } | null;
  /** URL signée (relative à l'API, hôte compris), valable quelques minutes : à lire au rendu, jamais à garder. */
  readonly photo?: { readonly url: string; readonly thumbnail_url: string; readonly count: number } | null;
  readonly quote?: { readonly amount: number; readonly currency: string | null } | null;
};

/** Les blocs que l'écran 2 lit (`fields[intervention_d_origine]`). */
export const CHAMPS_DE_L_INTERVENTION_D_ORIGINE = 'title,category,place,photo,quote';

export async function fetchInterventionDOrigine(
  token: string,
  spProfileId: number,
): Promise<{ data: InterventionDOrigine | null }> {
  return apiRequest<{ data: InterventionDOrigine | null }>(
    cheminApi`/api/me/profiles/${spProfileId}/intervention-d-origine?fields[intervention_d_origine]=${CHAMPS_DE_L_INTERVENTION_D_ORIGINE}`,
    { token },
  );
}

/** TCK-592 (P16) — ce que la section prestataire du profil édite : la liste « Complétez votre profil » s'y lit. */
export type ReglagesDuPrestataire = {
  readonly id: number;
  readonly trades: readonly string[];
  readonly intervention_zones: readonly string[];
  readonly hourly_rate: number | string | null;
  readonly visit_fee: number | null;
  readonly available_slots: readonly AvailabilitySlot[];
};

export async function fetchReglagesDuPrestataire(token: string, spProfileId: number): Promise<{ data: ReglagesDuPrestataire }> {
  return apiRequest<{ data: ReglagesDuPrestataire }>(cheminApi`/api/me/profiles/${spProfileId}`, { token });
}

/**
 * TCK-2613 — « Accepter » et « Proposer un créneau » d'un seul geste : `POST /api/maintenance-requests/{id}/accept`,
 * avec `scheduled_at` (TCK-2680 : un instant ISO, après maintenant, dans l'horizon de passage) quand un créneau est
 * proposé.
 */
export type InterventionAcceptee = { readonly id: number; readonly scheduled_at: string | null; readonly accepted_at: string | null };

export async function accepterIntervention(
  token: string,
  maintenanceRequestId: number,
  scheduledAt: string | null,
): Promise<{ data: InterventionAcceptee }> {
  return apiRequest<{ data: InterventionAcceptee }>(cheminApi`/api/maintenance-requests/${maintenanceRequestId}/accept`, {
    method: 'POST',
    token,
    ...(scheduledAt ? { body: { scheduled_at: scheduledAt } } : {}),
  });
}
