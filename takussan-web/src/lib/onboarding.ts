import { apiRequest } from './api';

/**
 * TCK-255 — Wire payload for `POST /api/host/individual/onboard`.
 * Mirrors `App\Http\Requests\Onboarding\HostIndividualOnboardRequest`.
 *
 * Note: the original spec carried a `first_property_draft` block. That step
 * has been removed from the wizard so the user lands on the regular
 * property-creation form right after onboarding instead.
 */
export type HostIndividualOnboardPayload = {
  agency: { name: string; primary_city: string; currency: string };
  phone_otp: { phone: string; code: string };
  /**
   * TCK-2372 (P249.03) — FACULTATIF : le « Type de bien principal » a quitté
   * l'assistant, rien ne le lisait (TCK-966). Le back l'accepte encore, pour un
   * brouillon repris ; l'assistant ne l'envoie plus.
   */
  preferences?: { primary_property_type: string };
  /**
   * TCK-496 — FACULTATIF depuis que l'étape « mode de paiement » a quitté
   * l'assistant. Le champ reste dans le contrat, et le back l'accepte encore :
   * un brouillon repris sous l'ancien parcours doit continuer de passer.
   * L'assistant, lui, ne l'envoie plus.
   */
  payment_setting?: { preferred_provider: string };
  cgu_accepted: boolean;
};

export type HostIndividualOnboardResponse = {
  data: {
    agency: { id: number; name: string; slug: string; kind: string; status: string };
    profiles: {
      agency_admin: { role: 'agency_admin'; agency_id: number };
      owner: { id: number; agency_id: number; status: string };
    };
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

/**
 * TCK-2938 — `POST /api/me/agencies` (TCK-2937, ADR-0125) : « Créer mon espace pro » de l'orientation
 * ouvre une agence `standard`, non vérifiée, dont l'appelant est l'administrateur principal.
 * Miroir de `App\Http\Requests\Api\Me\StoreOwnAgencyRequest` ; `ninea` n'est pas envoyé par l'écran.
 */
export type OuvertureDAgencePayload = {
  name: string;
  /** La ville principale, choisie dans `GET /api/public/geo/cities` — jamais un texte libre. */
  geo_city_id?: number | null;
  /** Le téléphone de l'agence ; absent, l'API reprend celui du compte. */
  phone?: string | null;
};

export type OuvertureDAgenceResponse = {
  data: {
    agency: { id: number; name: string; slug: string; kind: string; status: string; is_verified: boolean };
    kyc_dossier: { id: number; status: string };
    active_profile_id: string;
  };
};

export async function ouvrirMonAgence(token: string, payload: OuvertureDAgencePayload): Promise<OuvertureDAgenceResponse> {
  return apiRequest<OuvertureDAgenceResponse>('/api/me/agencies', { method: 'POST', token, body: payload });
}
