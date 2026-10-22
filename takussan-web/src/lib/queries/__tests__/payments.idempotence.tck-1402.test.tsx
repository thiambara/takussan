import { describe, expect, it, vi } from 'vitest';

import { useApiMutation } from '@/hooks/useApiQuery';
import { useCreateInvoice } from '../payments';

/** TCK-1402 (P144.05, ADR-0072 lot 2) — la facture part sous une clé d'idempotence (TCK-1396). */
vi.mock('@/hooks/useApiQuery', () => ({ useApiMutation: vi.fn(), useApiQuery: vi.fn() }));

describe('facture — clé d’idempotence (TCK-1402)', () => {
  it('useCreateInvoice demande l’option idempotence', () => {
    useCreateInvoice();

    expect(vi.mocked(useApiMutation)).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/invoices', method: 'POST' }),
      expect.objectContaining({ idempotence: true }),
    );
  });
});
