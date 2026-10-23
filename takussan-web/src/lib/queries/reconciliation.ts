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
  MatchCandidate,
  MatchedPaymentType,
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
