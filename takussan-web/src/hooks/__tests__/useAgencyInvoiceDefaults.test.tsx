import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const useApiQueryMock = vi.fn();
vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (...args: unknown[]) => useApiQueryMock(...args),
}));
const AUTH = vi.hoisted(() => ({ user: null as { agency_id: number | null } | null }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => AUTH }));

import { useAgencyInvoiceDefaults } from '../useAgencyInvoiceDefaults';

/** P133.01 (TCK-1375) — le taux par défaut de l'agence de l'émetteur, lu sur `GET /api/agencies/{id}`. */
describe('useAgencyInvoiceDefaults', () => {
  beforeEach(() => {
    useApiQueryMock.mockReset();
    AUTH.user = null;
  });

  it('sans agence, ne demande rien et ne se dit pas prêt', () => {
    useApiQueryMock.mockReturnValue({ data: undefined });
    const { result } = renderHook(() => useAgencyInvoiceDefaults());

    expect(result.current).toEqual({ taxRate: null, ready: false });
    expect(useApiQueryMock.mock.calls[0]![2]).toMatchObject({ enabled: false });
  });

  it('lit le taux de l’agence de l’émetteur', () => {
    AUTH.user = { agency_id: 4 };
    useApiQueryMock.mockReturnValue({ data: { data: { id: 4, default_tax_rate: 18 } } });
    const { result } = renderHook(() => useAgencyInvoiceDefaults());

    expect(useApiQueryMock.mock.calls[0]![1]).toBe('/api/agencies/4');
    expect(result.current).toEqual({ taxRate: 18, ready: true });
  });

  it('une agence sans taux est prête, à `null`', () => {
    AUTH.user = { agency_id: 4 };
    useApiQueryMock.mockReturnValue({ data: { data: { id: 4, default_tax_rate: null } } });
    const { result } = renderHook(() => useAgencyInvoiceDefaults());

    expect(result.current).toEqual({ taxRate: null, ready: true });
  });
});
