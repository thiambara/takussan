import { apiRequest } from './api';
import { cheminApi, requete } from '@/lib/chemin-api';

/**
 * TCK-257 — wire types & helpers for the post-acceptance Owner
 * onboarding wizard.
 *
 * The wizard talks to four backend endpoints:
 *  1. POST /api/me/owner-profiles/{id}/kyc/upload    — multipart CNI/RIB/NINEA
 *  2. POST /api/me/owner-profiles/{id}/kyc/submit    — stamps kyc.submitted_at
 *  3. POST /api/owner/onboard/complete                — OTP + flip status + cookie
 *  4. GET  /api/me/owner-profiles/{id}/properties    — pre-attached properties
 */

export type OwnerKycSubmitResponse = {
  data: {
    id: number;
    kyc: {
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
  /** TCK-2613 — `rent` ou `sale` : le loyer ne se dit « /mois » que d'un bien en location au mois. */
  contract_type?: string | null;
  rent_period?: string | null;
  /** TCK-2613 — la vignette (`PropertyResource::main_photo_url`). */
  main_photo_url?: string | null;
  /** TCK-2613 — le quartier de l'adresse (`include=address`). */
  location?: { quarter?: string | null; city?: string | null } | null;
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
    cheminApi`/api/me/owner-profiles/${ownerProfileId}/kyc/submit`,
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

/**
 * TCK-2613 — l'écran « Vos biens chez {agence} » : trois biens au plus (le compte vient de `meta.total`), avec ce
 * qu'une ligne dit — vignette, type, quartier, état, loyer.
 */
export const BIENS_DU_BAILLEUR_REQUETE =
  'fields[properties]=id,title,price,status,type,contract_type,rent_period&include=address&per_page=3';

export async function fetchOwnerProperties(
  token: string,
  ownerProfileId: number,
  query = BIENS_DU_BAILLEUR_REQUETE,
): Promise<OwnerPropertiesResponse> {
  return apiRequest<OwnerPropertiesResponse>(
    cheminApi`/api/me/owner-profiles/${ownerProfileId}/properties${requete(query)}`,
    { token },
  );
}

/**
 * TCK-2838 — la personne qui, à l'agence, s'occupe du bailleur invité (`GET /api/me/owner-profiles/{id}/interlocuteur`) :
 * l'invitant s'il est encore membre actif de l'agence (`source: 'inviter'`), sinon l'agence (`source: 'agency'`, sans nom).
 * Le rôle est un code ; le texte se compose ici, sous `onboarding.invite.bailleur.interlocuteur.roles`.
 */
export type InterlocuteurDuBailleur = {
  source: 'inviter' | 'agency';
  first_name?: string | null;
  last_name?: string | null;
  role?: 'agent' | 'agency_admin' | 'agency';
  phone?: string | null;
  whatsapp?: boolean;
};

export const INTERLOCUTEUR_REQUETE = 'fields[interlocuteur]=first_name,last_name,role,phone,whatsapp';

export async function fetchInterlocuteurDuBailleur(
  token: string,
  ownerProfileId: number,
): Promise<{ data: InterlocuteurDuBailleur | null }> {
  return apiRequest<{ data: InterlocuteurDuBailleur | null }>(
    cheminApi`/api/me/owner-profiles/${ownerProfileId}/interlocuteur${requete(INTERLOCUTEUR_REQUETE)}`,
    { token },
  );
}
