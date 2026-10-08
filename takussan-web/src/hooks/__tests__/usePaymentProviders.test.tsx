/**
 * TCK-602 (ADR-0051 §3) — les fournisseurs viennent du point d'entrée du PAIEMENT, sous
 * l'autorisation de l'initiation, et non plus de `GET /api/integrations` (403 au locataire).
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { usePaymentProviders } from '../usePaymentProviders';

const useApiQuery = vi.fn();
vi.mock('@/hooks/useApiQuery', () => ({ useApiQuery: (...a: unknown[]) => useApiQuery(...a) }));

beforeEach(() => useApiQuery.mockReset());

describe('usePaymentProviders', () => {
  it('lit les fournisseurs du paiement sur son point d’entrée', () => {
    useApiQuery.mockReturnValue({ data: { data: { providers: ['wave'] } }, error: null, isLoading: false });
    expect(renderHook(() => usePaymentProviders('lease-payments', 12)).result.current.providers).toEqual(['wave']);
    expect(useApiQuery).toHaveBeenCalledWith(
      ['payments', 'gateway-providers', 'lease-payments', 12],
      '/api/lease-payments/12/providers',
      { enabled: true },
    );
    expect(useApiQuery.mock.calls.flat().join(' ')).not.toContain('/api/integrations');
  });

  it('une liste vide reste vide', () => {
    useApiQuery.mockReturnValue({ data: { data: { providers: [] } }, error: null, isLoading: false });
    expect(renderHook(() => usePaymentProviders('invoices', 3)).result.current.providers).toEqual([]);
  });

  it('un fournisseur inconnu du front est écarté', () => {
    useApiQuery.mockReturnValue({ data: { data: { providers: ['wave', 'inconnu'] } }, error: null, isLoading: false });
    expect(renderHook(() => usePaymentProviders('lease-payments', 12)).result.current.providers).toEqual(['wave']);
  });

  it('un refus ou un identifiant invalide : aucune requête utile, liste vide', () => {
    useApiQuery.mockReturnValue({ data: undefined, error: new ApiError(403, null), isLoading: false });
    expect(renderHook(() => usePaymentProviders('lease-payments', 12)).result.current.providers).toEqual([]);

    useApiQuery.mockClear();
    renderHook(() => usePaymentProviders('lease-payments', Number.NaN));
    expect(useApiQuery).toHaveBeenCalledWith(
      ['payments', 'gateway-providers', 'lease-payments', null],
      '/api/lease-payments/0/providers',
      { enabled: false },
    );
  });
});
