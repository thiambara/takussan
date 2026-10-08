/**
 * TCK-593 (Partie 4) — aucun relais BFF pour le rapprochement : chaque chemin doit porter `/api`.
 * Sans lui, `apiRequest` frappe une route que Laravel n'expose pas, et l'échec se lit comme un
 * `net::ERR_FAILED` de CORS, pas comme un 404 (le piège du préfixe, `CLAUDE.md`).
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useApiQuery = vi.fn();
const useApiMutation = vi.fn();
vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (...a: unknown[]) => useApiQuery(...a),
  useApiMutation: (...a: unknown[]) => useApiMutation(...a),
}));

import * as rq from '../reconciliation';

beforeEach(() => {
  useApiQuery.mockReset();
  useApiMutation.mockReset();
});

describe('requêtes du rapprochement — préfixe /api', () => {
  it('les lectures', () => {
    renderHook(() => {
      rq.useBankStatements(3);
      rq.useBankStatement(1);
      rq.useBankStatementLines(1, 'suggested', 1);
      rq.useCsvMapping(3);
      rq.usePaymentSearch(3, 'x', 10, 'credit', true);
    });
    const chemins = useApiQuery.mock.calls.map((c) => c[1]);
    expect(chemins).toEqual([
      '/api/agencies/3/bank-statements',
      '/api/bank-statements/1',
      '/api/bank-statements/1/lines',
      '/api/agencies/3/bank-statements/csv-mapping',
      '/api/agencies/3/bank-statements/payment-search',
    ]);
    expect(useApiQuery.mock.calls[2][2].params.filter).toEqual({ match_status: 'suggested' });
    expect(useApiQuery.mock.calls[4][2].params.extra).toEqual({ q: 'x', amount: 10, direction: 'credit' });
  });

  it('les écritures', () => {
    renderHook(() => {
      rq.useSaveCsvMapping(3);
      rq.useImportBankStatement(3);
      rq.useMatchLine(1);
      rq.useUnmatchLine(1);
      rq.useIgnoreLine(1);
      rq.useFinalizeStatement(1);
    });
    const formes = useApiMutation.mock.calls.map((c) => c[0]);
    const chemin = (f: { path: string | ((v: unknown) => string) }, v: unknown) =>
      typeof f.path === 'function' ? f.path(v) : f.path;
    expect(formes.map((f, i) => [chemin(f, i === 2 ? { lineId: 9 } : 9), f.method])).toEqual([
      ['/api/agencies/3/bank-statements/csv-mapping', 'PUT'],
      ['/api/agencies/3/bank-statements', 'POST'],
      ['/api/bank-statement-lines/9/match', 'POST'],
      ['/api/bank-statement-lines/9/match', 'DELETE'],
      ['/api/bank-statement-lines/9/ignore', 'POST'],
      ['/api/bank-statements/1/finalize', 'POST'],
    ]);
    expect(formes[1].formData).toBe(true);
  });
});
