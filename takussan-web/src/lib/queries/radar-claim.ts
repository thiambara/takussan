import { apiRequest } from '@/lib/api';
import type { AuthResponse } from '@/lib/auth';
import { cheminApi } from '@/lib/chemin-api';
import { codeApercu } from '@/lib/otp-preview';

/**
 * TCK-2390 (ADR-0077 §3) — la réclamation de ses annonces par l'annonceur du Radar, sur la page
 * publique `/{locale}/claim/{jeton}`.
 *
 * Le jeton signé EST l'autorisation : il ne voyage que dans le chemin, par `cheminApi`, et la page
 * qui le porte sert `no-referrer`. `apiRequest` (préfixe `/api` écrit ici) et non `apiFetch` : la
 * session du navigateur, quand il y en a une, part avec l'appel — l'API ne la lit que pour le
 * titulaire déjà inscrit du numéro, qui confirme connecté.
 *
 * L'API ne rend jamais le numéro en clair (`phone_masked`), ni rien du Radar (nature, source,
 * verdict) : la page n'en reçoit pas, elle ne peut pas en afficher.
 */
export type RadarClaimAccountState = 'new' | 'activation' | 'existing' | 'unavailable' | 'support';

export interface RadarClaimListing {
  readonly id: number;
  readonly title: string | null;
  readonly description: string | null;
  readonly price: number | null;
  readonly contract: string | null;
  readonly rent_period: string | null;
  readonly property_type: string | null;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly surface_m2: number | null;
  readonly furnished: boolean | null;
  readonly neighborhood: string | null;
  readonly photo_url: string | null;
}

export interface RadarClaim {
  readonly advertiser: {
    readonly first_name: string | null;
    readonly phone_masked: string;
  };
  readonly account: {
    readonly state: RadarClaimAccountState;
    readonly space_name: string;
    readonly viewer_is_owner: boolean;
    readonly viewer_is_other: boolean;
    readonly space: { readonly name: string } | null;
  };
  readonly listings: readonly RadarClaimListing[];
  /** Déjà confirmées par l'annonceur, en attente de la publication : ni case ni bouton. */
  readonly publishing: readonly RadarClaimListing[];
  readonly published: readonly { readonly title: string | null; readonly public_url: string }[];
  readonly terms_version: string;
}

export interface RadarClaimCodeRequest {
  /** Secondes avant un nouvel envoi. */
  readonly attente: number;
  readonly phoneMasked: string;
  /** Hors production seulement (ADR-0060) : le code, quand l'API le rend. */
  readonly codeApercu: string | null;
}

/** Une annonce retenue, et les seules corrections que la page permet. */
export interface RadarClaimSelection {
  readonly id: number;
  readonly title?: string;
  readonly price?: number;
  readonly description?: string;
}

export interface RadarClaimConfirmation {
  readonly code: string;
  readonly terms_version: string;
  readonly listings: readonly RadarClaimSelection[];
  readonly first_name?: string;
  readonly space_name?: string;
}

export interface RadarClaimResult {
  readonly claim: {
    readonly state: RadarClaimAccountState;
    readonly agency: { readonly id: number; readonly name: string };
    readonly listing_ids: readonly number[];
    readonly declined_ids: readonly number[];
  };
  /** Présente quand le code vient d'ouvrir la session (compte neuf ou compte du Radar). */
  readonly session: AuthResponse | null;
}

export async function fetchRadarClaim(jeton: string, token: string | null): Promise<RadarClaim> {
  const res = await apiRequest<{ data: RadarClaim }>(cheminApi`/api/radar/claims/${jeton}`, {
    token: token ?? undefined,
  });
  return res.data;
}

/** Le code part au numéro de l'annonceur, et à lui seul : la requête n'en porte aucun. */
export async function requestRadarClaimCode(jeton: string, token: string | null): Promise<RadarClaimCodeRequest> {
  const res = await apiRequest<{ data?: { retry_after?: unknown; phone_masked?: unknown } }>(
    cheminApi`/api/radar/claims/${jeton}/otp`,
    { method: 'POST', body: {}, token: token ?? undefined },
  );
  const attente = res?.data?.retry_after;
  return {
    attente: typeof attente === 'number' && Number.isFinite(attente) && attente > 0 ? Math.ceil(attente) : 60,
    phoneMasked: typeof res?.data?.phone_masked === 'string' ? res.data.phone_masked : '',
    codeApercu: codeApercu(res),
  };
}

export async function confirmRadarClaim(
  jeton: string,
  confirmation: RadarClaimConfirmation,
  token: string | null,
): Promise<RadarClaimResult> {
  const res = await apiRequest<{ claim: RadarClaimResult['claim'] } & Partial<AuthResponse>>(
    cheminApi`/api/radar/claims/${jeton}/confirm`,
    { method: 'POST', body: { ...confirmation, accept_terms: true }, token: token ?? undefined },
  );
  const session =
    typeof res.token === 'string' && res.user ? ({ token: res.token, user: res.user, expires_at: res.expires_at } as AuthResponse) : null;
  return { claim: res.claim, session };
}
