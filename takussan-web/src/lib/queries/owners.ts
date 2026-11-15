import { apiRequest, buildQueryString } from '@/lib/api';
import type {
  ApiResponse,
  PaginatedResponse,
  SpatieQueryParams,
} from '@/types/api';
import { cheminApi, requete } from '@/lib/chemin-api';

/**
 * TCK-256 — owners query layer.
 *
 * All reads obey the spatie/laravel-query-builder conventions:
 *  - sparse fieldsets via `fields[owner_profiles]=...`
 *  - `include=user` so the listing can show the email/name without a
 *    second round-trip
 *  - `filter[agency_id]=...` (the backend index endpoint is agency-aware)
 *
 * Mutations target the per-role endpoint introduced by this ticket
 * (`POST /api/agencies/{id}/owners/invite`) plus the generic invitation
 * lifecycle endpoints (`POST /api/invitations/{id}/{revoke|resend}`)
 * already shipped in TCK-249.
 */

/**
 * TCK-601 (ADR-0044 §1) — `rib`, `tax_id` et `id_document_number` ne figurent PAS ici et ne
 * peuvent plus y figurer : l'API refuse de les servir par `fields[owner_profiles]` (400). Chaque
 * ligne porte à la place leurs MASQUES (`*_masked`), calculés côté serveur quelle que soit la
 * liste demandée. La valeur complète ne sort que par {@link fetchOwnerSensitive}.
 */
export const OWNER_PROFILE_FIELDS = [
  'id',
  'user_id',
  'agency_id',
  'status',
  'metadata',
  'created_at',
] as const;

export type OwnerProfileStatus =
  | 'draft'
  | 'active'
  | 'inactive'
  | 'blocked';

export type OwnerProfileSummary = {
  readonly id: number;
  readonly user_id: number | null;
  readonly agency_id: number;
  readonly status: OwnerProfileStatus;
  readonly metadata: {
    readonly email?: string;
    readonly first_name?: string;
    readonly last_name?: string;
    readonly phone?: string | null;
    readonly owner_type?: 'individual' | 'company';
    readonly company_name?: string | null;
  } | null;
  readonly created_at: string | null;
  /** TCK-601 — masques rendus par l'API (`SN•• •••• ••34`, `•••• 4567`), jamais la valeur. */
  readonly rib_masked?: string | null;
  readonly tax_id_masked?: string | null;
  readonly id_document_number_masked?: string | null;
  /** TCK-956 (ADR-0070) — `••••` si un revenu est saisi ; aucun chiffre ne sort. */
  readonly monthly_income_masked?: string | null;
  /**
   * P237.01 (TCK-2371) — l'invitation `sent` du brouillon, émise par l'agence du profil (`null`
   * sans elle). Rendue sur chaque ligne quelle que soit la liste `fields[]` demandée : la relance
   * et la révocation partent par elle.
   */
  readonly pending_invitation_id?: number | null;
  /** TCK-2641 — le dernier envoi de cette invitation (création ou relance) ; `null` sans elle. */
  readonly pending_invitation_sent_at?: string | null;
  /**
   * TCK-2640 — les chiffres de la ligne, calculés par l'API quelle que soit la liste `fields[]` :
   * biens (non supprimés, non archivés) et biens occupés (bail en cours), le contact (celui du
   * compte, sinon celui de l'invitation), le reste à verser et (TCK-2641) l'encaissé du mois
   * courant, lus au relevé servi, et le dernier versement. Les trois chiffres d'argent sont `null`
   * pour qui ne lit pas le relevé (`payouts.create`) et pour un brouillon d'invitation.
   */
  readonly properties_count?: number;
  readonly occupied_properties_count?: number;
  readonly contact_phone?: string | null;
  readonly contact_email?: string | null;
  readonly remaining_to_pay?: number | null;
  readonly collected_this_month?: number | null;
  readonly last_payout_at?: string | null;
  readonly user?: {
    readonly id: number;
    readonly first_name: string;
    readonly last_name: string;
    readonly email: string;
  } | null;
};

/**
 * TCK-1323 (P117.05) — la raison sociale d'un bailleur société (`metadata.company_name`, exigée à
 * l'invitation), `null` pour un particulier. P234.06 (TCK-2315) : lue par le carnet et par le
 * dialogue de reversement.
 */
export function raisonSocialeDe(owner: OwnerProfileSummary): string | null {
  const meta = owner.metadata ?? null;
  if (meta?.owner_type !== 'company') return null;
  const raison = meta.company_name?.trim();
  return raison ? raison : null;
}

export type InviteOwnerPayload = {
  readonly email: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly phone?: string | null;
  readonly owner_type: 'individual' | 'company';
  readonly company_name?: string | null;
};

export type InvitationSummary = {
  readonly id: number;
  readonly email: string;
  readonly role: string;
  readonly status: 'sent' | 'accepted' | 'revoked' | 'expired';
  readonly agency_id: number | null;
  readonly invitable_type: string | null;
  readonly invitable_id: number | null;
  readonly expires_at: string | null;
};

export interface FetchOwnersParams {
  readonly agencyId: number;
  readonly page?: number;
  readonly perPage?: number;
  readonly sort?: string;
  readonly status?: OwnerProfileStatus;
  readonly search?: string;
  /** TCK-2640 — `filter[has_remaining]=1` : un reste à verser non nul ce mois-ci. */
  readonly hasRemaining?: boolean;
}

function buildParams({
  agencyId,
  page,
  perPage,
  sort,
  status,
  search,
  hasRemaining,
}: FetchOwnersParams): SpatieQueryParams {
  const filter: Record<string, string | number> = { agency_id: agencyId };
  if (status) filter.status = status;
  if (search) filter.search = search;
  if (hasRemaining) filter.has_remaining = 1;

  return {
    fields: { owner_profiles: OWNER_PROFILE_FIELDS },
    include: ['user'],
    filter,
    sort: sort ?? '-created_at',
    page: page ?? 1,
    per_page: perPage ?? 20,
  };
}

/**
 * TCK-2641 (décision 4a) — `meta.summary` de `GET /api/owners` : le carnet entier de l'agence filtrée,
 * que ni la recherche, ni une vue, ni la page ne changent. `owners` compte les bailleurs (hors
 * brouillon), `invitations` les brouillons, `properties` leurs biens. Le reste à verser (somme des
 * restes positifs du mois courant) et le nombre de bailleurs qui en ont un sont `null` pour qui ne
 * lit pas le relevé (`payouts.create`). Le résumé entier est `null` pour le super-admin qui ne filtre
 * pas une agence.
 */
export interface ResumeDuCarnet {
  readonly owners: number;
  readonly properties: number;
  readonly remaining_to_pay: number | null;
  readonly with_remaining: number | null;
  readonly invitations: number;
}

export type PageDuCarnet = PaginatedResponse<OwnerProfileSummary> & {
  readonly meta: PaginatedResponse<OwnerProfileSummary>['meta'] & { readonly summary?: ResumeDuCarnet | null };
};

export async function fetchOwners(
  token: string,
  params: FetchOwnersParams,
): Promise<PageDuCarnet> {
  const qs = buildQueryString(buildParams(params));
  return apiRequest<PageDuCarnet>(
    cheminApi`/api/owners${requete(qs)}`,
    { token },
  );
}

/**
 * TCK-601 — les identifiants complets d'un bailleur (`GET /api/owners/{id}/sensitive`).
 *
 * Réservé à l'admin de l'agence du profil (403 pour un agent), exige une preuve récente de second
 * facteur (403 `two_factor_step_up_required`, que l'appelant confie à la garde de TCK-589), et
 * chaque appel est JOURNALISÉ côté serveur. ⚠ Ne pas le brancher sur une requête React Query :
 * la valeur ne doit vivre que le temps de l'affichage, jamais dans un cache partagé ni persisté.
 */
export type OwnerSensitiveData = {
  readonly id: number;
  readonly rib: string | null;
  readonly tax_id: string | null;
  readonly id_document_type: string | null;
  readonly id_document_number: string | null;
  /** TCK-956 — le revenu mensuel en clair, en nombre. */
  readonly monthly_income: number | null;
};

export async function fetchOwnerSensitive(
  token: string,
  ownerProfileId: number,
): Promise<ApiResponse<OwnerSensitiveData>> {
  return apiRequest<ApiResponse<OwnerSensitiveData>>(
    cheminApi`/api/owners/${ownerProfileId}/sensitive`,
    { token },
  );
}

/**
 * TCK-2640 / TCK-2641 — la fiche d'un bailleur (`GET /api/owners/{id}?period=YYYY-MM`), réservée à
 * l'admin de l'agence du profil (`OwnerProfilePolicy::viewDetail` : 403 à l'agent, 404 hors de
 * l'agence). Les chiffres du mois sont ceux du relevé servi (`OwnerStatementSnapshots::served()`),
 * jamais recalculés ; `figures` est `null` pour un brouillon d'invitation.
 */
export interface OwnerMonthFigures {
  readonly period: string;
  readonly currency: string | null;
  readonly collected: number;
  readonly commission: number;
  readonly fees: number;
  readonly net: number;
  readonly paid_out: number;
  readonly remaining_to_pay: number;
  readonly from_snapshot: boolean;
}

/**
 * TCK-2760 (décision 4 (a), ADR-0100 amendée) — le solde cumulé au jour : ce qui reste à verser au
 * bailleur, toutes périodes confondues, arrêté à `as_of` (date de Dakar). Il ne dépend pas de `period`,
 * et peut être négatif (trop versé). `null` pour qui ne lit pas le relevé.
 */
export interface OwnerBalance {
  readonly remaining_to_pay: number;
  readonly as_of: string;
}

export interface OwnerProfileDetail {
  readonly id: number;
  readonly user_id: number | null;
  readonly agency_id: number;
  readonly status: OwnerProfileStatus;
  readonly joined_at: string | null;
  /** TCK-2753 (ADR-0108 § 7) — la date du départ de l'agence ; `null` tant qu'il n'est pas parti. */
  readonly departed_at?: string | null;
  readonly owner_type: 'individual' | 'company';
  readonly company_name: string | null;
  readonly contact: {
    readonly first_name: string | null;
    readonly last_name: string | null;
    readonly full_name: string | null;
    readonly email: string | null;
    readonly phone: string | null;
  };
  readonly pending_invitation_id: number | null;
  readonly properties_count: number;
  readonly occupied_properties_count: number;
  readonly figures: OwnerMonthFigures | null;
  /** TCK-2760 — le reste à verser de la fiche ; `figures.remaining_to_pay` n'est que l'écart du mois. */
  readonly balance: OwnerBalance | null;
  readonly last_payout: {
    readonly id: number;
    readonly processed_at: string | null;
    readonly net_amount: number;
    readonly payment_method: string | null;
  } | null;
  readonly next_payout: unknown;
  readonly works_approval_threshold: number | null;
  readonly agency_commission_rate: number | null;
  readonly lease_commission_rates: readonly number[];
  /** TCK-2641 — les masques seulement (ADR-0044 § 1) ; la valeur passe par {@link fetchOwnerSensitive}. */
  readonly rib_masked: string | null;
  readonly tax_id_masked: string | null;
  readonly id_document_number_masked: string | null;
}

export async function fetchOwner(
  token: string,
  ownerProfileId: number,
  period?: string,
): Promise<ApiResponse<OwnerProfileDetail>> {
  const qs = period ? buildQueryString({ extra: { period } }) : '';
  return apiRequest<ApiResponse<OwnerProfileDetail>>(
    cheminApi`/api/owners/${ownerProfileId}${requete(qs)}`,
    { token },
  );
}

/**
 * TCK-2640 — le plafond de travaux sans accord (`PATCH /api/owners/{id}`, capacité `owners.update`) :
 * un montant ≥ 0 en XOF, ou `null` (aucun accord exigé). Il vaut pour les devis approuvés ensuite.
 */
export async function updateOwnerWorksThreshold(
  token: string,
  ownerProfileId: number,
  worksApprovalThreshold: number | null,
): Promise<ApiResponse<OwnerProfileDetail>> {
  return apiRequest<ApiResponse<OwnerProfileDetail>>(
    cheminApi`/api/owners/${ownerProfileId}`,
    { token, method: 'PATCH', body: { works_approval_threshold: worksApprovalThreshold } },
  );
}

export async function inviteOwner(
  token: string,
  agencyId: number,
  payload: InviteOwnerPayload,
): Promise<ApiResponse<InvitationSummary>> {
  return apiRequest<ApiResponse<InvitationSummary>>(
    cheminApi`/api/agencies/${agencyId}/owners/invite`,
    { token, method: 'POST', body: payload },
  );
}

export async function resendInvitation(
  token: string,
  invitationId: number,
): Promise<ApiResponse<InvitationSummary>> {
  return apiRequest<ApiResponse<InvitationSummary>>(
    cheminApi`/api/invitations/${invitationId}/resend`,
    { token, method: 'POST' },
  );
}

export async function revokeInvitation(
  token: string,
  invitationId: number,
): Promise<ApiResponse<InvitationSummary>> {
  return apiRequest<ApiResponse<InvitationSummary>>(
    cheminApi`/api/invitations/${invitationId}/revoke`,
    { token, method: 'POST' },
  );
}
