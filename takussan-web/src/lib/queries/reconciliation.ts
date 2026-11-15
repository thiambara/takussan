import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import { useAuth } from '@/context/AuthContext';
import { apiRequest, buildQueryString, type ApiError } from '@/lib/api';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type {
  BankLineDirection,
  BankLineMatchStatus,
  BankStatement,
  BankStatementLine,
  CsvMapping,
  FiltreDuReste,
  MatchCandidate,
  MatchedPaymentType,
  PendingPayment,
  ReconciliationOverview,
} from '@/types/reconciliation';
import { cheminApi, requete } from '@/lib/chemin-api';
import { lireToutesLesPages, PAR_PAGE_MAX } from './toutes-les-pages';

/**
 * TCK-593 (Partie 4) — rapprochement bancaire.
 *
 * ⚠ Aucun relais BFF : chaque chemin porte `/api` en tête, `apiRequest` ne l'ajoute pas
 * (le piège du préfixe, `CLAUDE.md`).
 */
export const reconciliationKeys = {
  all: ['reconciliation'] as const,
  statements: (agencyId: number) => ['reconciliation', 'statements', agencyId] as const,
  statement: (id: number) => ['reconciliation', 'statement', id] as const,
  lines: (id: number, matchStatus: BankLineMatchStatus | null, page: number) =>
    ['reconciliation', 'lines', id, matchStatus, page] as const,
  mapping: (agencyId: number) => ['reconciliation', 'csv-mapping', agencyId] as const,
  search: (
    agencyId: number,
    q: string,
    amount: number | null,
    direction: BankLineDirection | null,
    currency: string | null,
  ) => ['reconciliation', 'search', agencyId, q, amount, direction, currency] as const,
  // TCK-2675 — le reste à rapprocher, par mois. Toutes sous `['reconciliation']` : un geste du reste
  // (confirmer, délier, rapprocher d'une ligne cherchée) invalide la racine, compteurs compris.
  overview: (agencyId: number, period: string) => ['reconciliation', 'overview', agencyId, period] as const,
  pending: (agencyId: number, period: string, filtre: string, tout: boolean) =>
    ['reconciliation', 'pending', agencyId, period, filtre, tout] as const,
  suggestionsSures: (agencyId: number, period: string, filtre: string) =>
    ['reconciliation', 'pending-suggestions', agencyId, period, filtre] as const,
  compteAvecSuggestion: (agencyId: number, period: string) =>
    ['reconciliation', 'pending-with-suggestion', agencyId, period] as const,
  lineSearch: (agencyId: number, amount: number | null, dateFrom: string | null) =>
    ['reconciliation', 'line-search', agencyId, amount, dateFrom] as const,
};

/**
 * TCK-1373 (P135.05) — TOUS les relevés de l'agence, page par page : la liste n'a pas de
 * pagination, et une page de 50 laissait les plus anciens hors de l'écran.
 */
export function useBankStatements(agencyId: number) {
  const locale = useLocale();
  const { token } = useAuth();

  return useQuery<PaginatedResponse<BankStatement>, ApiError>({
    queryKey: reconciliationKeys.statements(agencyId),
    queryFn: ({ signal }) =>
      lireToutesLesPages((page) =>
        apiRequest<PaginatedResponse<BankStatement>>(
          cheminApi`/api/agencies/${agencyId}/bank-statements${requete(
            buildQueryString({ sort: '-created_at', page, per_page: PAR_PAGE_MAX }),
          )}`,
          { token: token ?? undefined, locale, signal },
        ),
      ),
  });
}

export function useBankStatement(id: number) {
  return useApiQuery<ApiResponse<BankStatement>>(
    reconciliationKeys.statement(id),
    cheminApi`/api/bank-statements/${id}`,
  );
}

export const BANK_LINE_FIELDS = [
  'id',
  'bank_statement_id',
  'posted_at',
  'amount',
  'direction',
  'currency',
  'label',
  'reference',
  'counterparty',
  // TCK-1919 (P157.06) — la marque d'une ligne déjà importée par un autre relevé.
  'duplicate_of_line_id',
  'match_status',
  'matched_payment_type',
  'matched_payment_id',
  // TCK-2793 — la part désignée : sans elle, la pénalité payée seule se lirait « Loyer ».
  'matched_part',
  'match_confidence',
] as const;

export function useBankStatementLines(
  id: number,
  matchStatus: BankLineMatchStatus | null,
  page: number,
) {
  return useApiQuery<PaginatedResponse<BankStatementLine>>(
    reconciliationKeys.lines(id, matchStatus, page),
    cheminApi`/api/bank-statements/${id}/lines`,
    {
      params: {
        fields: { bank_statement_lines: [...BANK_LINE_FIELDS] },
        filter: matchStatus ? { match_status: matchStatus } : {},
        sort: 'posted_at',
        page,
        per_page: 50,
      },
    },
  );
}

export function useCsvMapping(agencyId: number) {
  return useApiQuery<ApiResponse<CsvMapping>>(
    reconciliationKeys.mapping(agencyId),
    cheminApi`/api/agencies/${agencyId}/bank-statements/csv-mapping`,
  );
}

export function useSaveCsvMapping(agencyId: number) {
  return useApiMutation<ApiResponse<CsvMapping>, CsvMapping>(
    { path: cheminApi`/api/agencies/${agencyId}/bank-statements/csv-mapping`, method: 'PUT' },
    { invalidate: [reconciliationKeys.mapping(agencyId)] },
  );
}

export function useImportBankStatement(agencyId: number) {
  return useApiMutation<ApiResponse<BankStatement>, FormData>(
    { path: cheminApi`/api/agencies/${agencyId}/bank-statements`, method: 'POST', formData: true },
    { invalidate: [reconciliationKeys.statements(agencyId)] },
  );
}

export function usePaymentSearch(
  agencyId: number,
  q: string,
  amount: number | null,
  direction: BankLineDirection | null,
  // P157.01 (TCK-1917) — la devise de la ligne : l'API ne propose que les paiements que la
  // confirmation accepte.
  currency: string | null,
  enabled: boolean,
) {
  return useApiQuery<{ data: MatchCandidate[] }>(
    reconciliationKeys.search(agencyId, q, amount, direction, currency),
    cheminApi`/api/agencies/${agencyId}/bank-statements/payment-search`,
    { params: { extra: { q, amount, direction, currency } }, enabled },
  );
}

/** Toute action sur une ligne change le relevé (ratio, statut) et ses lignes. */
const invalidationsDuReleve = (statementId: number) => [
  ['reconciliation', 'lines', statementId],
  reconciliationKeys.statement(statementId),
  ['reconciliation', 'statements'],
];

export type MatchLinePayload = {
  lineId: number;
  payment_type: MatchedPaymentType;
  payment_id: number;
};

export function useMatchLine(statementId: number) {
  return useApiMutation<ApiResponse<BankStatementLine>, MatchLinePayload>(
    {
      path: ({ lineId }) => cheminApi`/api/bank-statement-lines/${lineId}/match`,
      method: 'POST',
      body: ({ payment_type, payment_id }) => ({ payment_type, payment_id }),
    },
    { invalidate: invalidationsDuReleve(statementId) },
  );
}

export function useUnmatchLine(statementId: number) {
  return useApiMutation<ApiResponse<BankStatementLine>, number>(
    { path: (lineId) => cheminApi`/api/bank-statement-lines/${lineId}/match`, method: 'DELETE', body: () => undefined },
    { invalidate: invalidationsDuReleve(statementId) },
  );
}

export function useIgnoreLine(statementId: number) {
  return useApiMutation<ApiResponse<BankStatementLine>, number>(
    { path: (lineId) => cheminApi`/api/bank-statement-lines/${lineId}/ignore`, method: 'POST', body: () => undefined },
    { invalidate: invalidationsDuReleve(statementId) },
  );
}

export function useFinalizeStatement(statementId: number) {
  return useApiMutation<ApiResponse<BankStatement>, void>(
    { path: cheminApi`/api/bank-statements/${statementId}/finalize`, method: 'POST', body: () => undefined },
    { invalidate: invalidationsDuReleve(statementId) },
  );
}


/* ─────────────── TCK-2675 — le reste à rapprocher (TCK-2674 pour le contrat) ─────────────── */

/** Une clé stable du filtre, pour les clés de requête. */
export function cleDuFiltre(filtre: FiltreDuReste): string {
  return filtre.type === 'moyen' ? `moyen:${filtre.moyen}` : filtre.type;
}

/**
 * Le filtre tel que l'API le lit — **côté serveur, toujours** : `filter[payment_method]` pour un
 * moyen, `filter[has_suggestion]` pour « avec » ou « sans » ligne proposée.
 */
export function filtreDeLApi(filtre: FiltreDuReste): Record<string, string> {
  if (filtre.type === 'moyen') return { payment_method: filtre.moyen };
  if (filtre.type === 'suggestion') return { has_suggestion: '1' };
  if (filtre.type === 'sans') return { has_suggestion: '0' };
  return {};
}

/** La première page de la liste : les montants les plus élevés d'abord (tri de l'API). */
export const RESTE_PAR_PAGE = 20;

function cheminDuReste(agencyId: number, period: string, filtre: Record<string, string>, page: number, perPage: number) {
  return cheminApi`/api/agencies/${agencyId}/reconciliation/pending-payments${requete(
    buildQueryString({ filter: filtre, page, per_page: perPage, extra: { period } }),
  )}`;
}

export function useReconciliationOverview(agencyId: number, period: string) {
  return useApiQuery<ApiResponse<ReconciliationOverview>>(
    reconciliationKeys.overview(agencyId, period),
    cheminApi`/api/agencies/${agencyId}/reconciliation/overview`,
    { params: { extra: { period } } },
  );
}

/**
 * Les paiements à rapprocher du mois, au filtre donné. `tout` lit toutes les pages (« Afficher les
 * N autres ») : une page de 100 au plus par appel, jusqu'à `meta.total`.
 */
export function usePendingPayments(agencyId: number, period: string, filtre: FiltreDuReste, tout: boolean) {
  const locale = useLocale();
  const { token } = useAuth();
  const cle = cleDuFiltre(filtre);
  return useQuery<PaginatedResponse<PendingPayment>, ApiError>({
    queryKey: reconciliationKeys.pending(agencyId, period, cle, tout),
    queryFn: ({ signal }) => {
      const lire = (page: number, perPage: number) =>
        apiRequest<PaginatedResponse<PendingPayment>>(cheminDuReste(agencyId, period, filtreDeLApi(filtre), page, perPage), {
          token: token ?? undefined,
          locale,
          signal,
        });
      return tout ? lireToutesLesPages((page) => lire(page, PAR_PAGE_MAX)) : lire(1, RESTE_PAR_PAGE);
    },
    // « Afficher les N autres » garde la liste à l'écran pendant la lecture ; un autre filtre ou un
    // autre mois repart d'un écran vide (jamais les cartes d'un autre filtre sous la pastille active).
    placeholderData: (precedent, requete) =>
      requete && requete.queryKey[3] === period && requete.queryKey[4] === cle ? precedent : undefined,
  });
}

/**
 * Les paiements du filtre qui ont une ligne proposée — TOUTES les pages : « Confirmer les N »
 * confirme ce que le bandeau compte, pas la seule page affichée. Sans objet pour « sans ligne ».
 */
export function useSuggestionsDuReste(agencyId: number, period: string, filtre: FiltreDuReste) {
  const locale = useLocale();
  const { token } = useAuth();
  const filtreApi = { ...filtreDeLApi(filtre), has_suggestion: '1' };
  return useQuery<PaginatedResponse<PendingPayment>, ApiError>({
    queryKey: reconciliationKeys.suggestionsSures(agencyId, period, cleDuFiltre(filtre)),
    queryFn: ({ signal }) =>
      lireToutesLesPages((page) =>
        apiRequest<PaginatedResponse<PendingPayment>>(cheminDuReste(agencyId, period, filtreApi, page, PAR_PAGE_MAX), {
          token: token ?? undefined,
          locale,
          signal,
        }),
      ),
    enabled: filtre.type !== 'sans',
  });
}

/** Le compte de la pastille « Avec suggestion » : `meta.total` d'une page d'un élément. */
export function useCompteAvecSuggestion(agencyId: number, period: string) {
  return useApiQuery<PaginatedResponse<PendingPayment>>(
    reconciliationKeys.compteAvecSuggestion(agencyId, period),
    cheminApi`/api/agencies/${agencyId}/reconciliation/pending-payments`,
    { params: { filter: { has_suggestion: '1' }, per_page: 1, extra: { period } } },
  );
}

/**
 * Chercher la ligne de banque d'un paiement : les crédits des relevés ouverts, au montant (± 1)
 * et, si on le donne, depuis une date.
 */
export function useBankLineSearch(agencyId: number, amount: number | null, dateFrom: string | null, enabled: boolean) {
  const filtre: Record<string, string | number> = { direction: 'credit' };
  if (amount !== null) filtre.amount = amount;
  if (dateFrom) filtre.date_from = dateFrom;
  return useApiQuery<PaginatedResponse<BankStatementLine>>(
    reconciliationKeys.lineSearch(agencyId, amount, dateFrom),
    cheminApi`/api/agencies/${agencyId}/bank-statement-lines`,
    { params: { filter: filtre, sort: '-posted_at', per_page: 50 }, enabled },
  );
}

/**
 * Tout geste du reste change les compteurs, la liste, les relevés : la racine entière se relit —
 * après un refus aussi (`relireSurErreur`) : un 422 dit que l'écran a vieilli.
 */
const INVALIDER_LE_RAPPROCHEMENT = [reconciliationKeys.all];

/** « Confirmer les N » : un seul appel, tout ou rien (422 `reconciliation.batch_not_confirmable`). */
export function useConfirmBatch(agencyId: number) {
  return useApiMutation<{ data: { line_ids: number[]; count: number } }, number[]>(
    {
      path: cheminApi`/api/agencies/${agencyId}/bank-statement-lines/confirm-batch`,
      method: 'POST',
      body: (lineIds) => ({ line_ids: lineIds }),
    },
    { invalidate: INVALIDER_LE_RAPPROCHEMENT, relireSurErreur: true },
  );
}

/** Rapprocher une ligne d'un paiement (confirmer la proposée, ou celle qu'on a cherchée). */
export function useRapprocherLigne() {
  return useApiMutation<ApiResponse<BankStatementLine>, MatchLinePayload>(
    {
      path: ({ lineId }) => cheminApi`/api/bank-statement-lines/${lineId}/match`,
      method: 'POST',
      body: ({ payment_type, payment_id }) => ({ payment_type, payment_id }),
    },
    { invalidate: INVALIDER_LE_RAPPROCHEMENT, relireSurErreur: true },
  );
}

/** « Délier » : la ligne proposée redevient libre, le paiement reste à rapprocher. */
export function useDelierLigne() {
  return useApiMutation<ApiResponse<BankStatementLine>, number>(
    { path: (lineId) => cheminApi`/api/bank-statement-lines/${lineId}/match`, method: 'DELETE', body: () => undefined },
    { invalidate: INVALIDER_LE_RAPPROCHEMENT, relireSurErreur: true },
  );
}
