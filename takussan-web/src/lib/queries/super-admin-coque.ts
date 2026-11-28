import { appelBff } from '@/lib/bff';
import { cheminApi } from '@/lib/chemin-api';
import type {
  AdminModerationResponse,
  FailedJobsResponse,
  KycDossierStatus,
  KycDossiersResponse,
  ModerationItemStatus,
  ModerationItemType,
} from '@/types/super-admin';

/**
 * Ce que la COQUE de la console super-admin lit sur chaque écran — TCK-1202 (P104.05), méthode de
 * TCK-1042.
 *
 * `GlobalSearch` (barre haute) et les quatre comptes des files (`super-admin-queues.ts`, barre
 * latérale et accueil) prenaient leurs lecteurs à `super-admin.ts` : 1 515 lignes et 96 exports,
 * qu'aucun bundler n'élague, entraient ainsi dans le JS initial de chacun des 37 écrans. Ils vivent
 * ici, et `super-admin.ts` les réexporte. Garde :
 * `src/app/__tests__/graphe-client-de-la-console.test.ts`.
 *
 * ⚠ N'ajouter ici que ce que la coque monte : chaque export y est payé par tous les écrans.
 */

/** Colonnes d'un dossier KYC — partagées avec `fetchAdminAgencyKyc` de `super-admin.ts`. */
export const KYC_DOSSIER_FIELDS = [
  'id',
  'subject_type',
  'subject_id',
  'status',
  'submitted_at',
  'reviewed_at',
  'reviewed_by',
  'rejection_reason',
  'metadata',
  // TCK-601 — cf. le même champ dans `queries/kyc.ts`.
  'expires_at',
  'created_at',
  'updated_at',
].join(',');

/**
 * La file KYC du super-admin.
 *
 * TCK-362 — `include=subject` n'est PAS décoratif : sans lui `KycDossierResource` n'émet que
 * `subject_id`, et l'écran retombe sur « Agence #12 ». C'est UN `include` pour toute la page,
 * jamais une requête par ligne.
 */
export async function fetchAdminKycQueue(params: {
  status?: KycDossierStatus;
  page?: number;
  perPage?: number;
} = {}): Promise<KycDossiersResponse> {
  return appelBff<KycDossiersResponse>(cheminApi`/api/super-admin/kyc?${requeteFileKyc(params).toString()}`);
}

/** TCK-1828 — la requête de la file KYC, lue par le navigateur et par l'accueil serveur. */
export function requeteFileKyc(params: {
  status?: KycDossierStatus;
  page?: number;
  perPage?: number;
} = {}): URLSearchParams {
  const qs = new URLSearchParams();
  qs.set('fields[kyc_dossiers]', KYC_DOSSIER_FIELDS);
  qs.set('include', 'subject');
  qs.set('filter[subject_type]', 'Agency');
  qs.set('filter[status]', params.status ?? 'submitted');
  qs.set('sort', 'submitted_at');
  qs.set('per_page', String(params.perPage ?? 20));
  if (params.page) qs.set('page', String(params.page));
  return qs;
}

/** TCK-600 — un résultat de la recherche globale de la console (`AdminGlobalSearchService`). */
export type GlobalSearchHit = {
  type: 'user' | 'agency' | 'property' | 'booking' | 'lease' | 'invoice' | 'payment' | 'payout' | string;
  id: number;
  label: string;
  sublabel: string | null;
  agency: { id: number; name: string } | null;
  /** Où ouvrir le résultat dans la console ; `null` quand il n'a pas d'écran à lui. */
  url: string | null;
};

/** TCK-600 — `GET /api/admin/search?q=` : correspondances exactes d'abord, puis texte libre. */
export async function fetchGlobalSearch(q: string, signal?: AbortSignal): Promise<{ data: GlobalSearchHit[] }> {
  return appelBff<{ data: GlobalSearchHit[] }>(cheminApi`/api/super-admin/search?${new URLSearchParams({ q }).toString()}`, { signal });
}

export async function fetchModerationQueue(params: {
  type?: ModerationItemType;
  status?: ModerationItemStatus;
  agencyId?: number;
  sort?: string;
  page?: number;
  perPage?: number;
} = {}): Promise<AdminModerationResponse> {
  return appelBff<AdminModerationResponse>(cheminApi`/api/super-admin/moderation?${requeteFileModeration(params).toString()}`);
}

/** TCK-1828 — la requête de la file de modération, lue par le navigateur et par l'accueil serveur. */
export function requeteFileModeration(params: {
  type?: ModerationItemType;
  status?: ModerationItemStatus;
  agencyId?: number;
  sort?: string;
  page?: number;
  perPage?: number;
} = {}): URLSearchParams {
  const qs = new URLSearchParams();
  // P100.05 (TCK-1186) — `fields` inerte : `Admin\ModerationQueueController::index` assemble la file à la main.
  qs.set('fields[moderation]', 'id,type,status,subject_type,subject_id,agency_id,reported_at,reason');
  qs.set('include', 'subject,reporter');
  if (params.type) qs.set('filter[type]', params.type);
  if (params.status) qs.set('filter[status]', params.status);
  if (typeof params.agencyId === 'number') qs.set('filter[agency_id]', String(params.agencyId));
  qs.set('sort', params.sort ?? '-reported_at');
  qs.set('page', String(params.page ?? 1));
  qs.set('per_page', String(params.perPage ?? 20));
  return qs;
}

export async function fetchFailedJobs(params: { page?: number; perPage?: number } = {}): Promise<FailedJobsResponse> {
  return appelBff<FailedJobsResponse>(cheminApi`/api/super-admin/jobs/failed?${requeteJobsEchoues(params).toString()}`);
}

/** TCK-1828 — la requête des jobs échoués, lue par le navigateur et par l'accueil serveur. */
export function requeteJobsEchoues(params: { page?: number; perPage?: number } = {}): URLSearchParams {
  const qs = new URLSearchParams();
  qs.set('per_page', String(params.perPage ?? 20));
  if (params.page) qs.set('page', String(params.page));
  return qs;
}

export async function fetchAdminAgencyUpgradePendingCount(): Promise<number> {
  const json = await appelBff<{ count: number }>('/api/super-admin/agency-upgrade-requests/pending-count');
  return json.count;
}
