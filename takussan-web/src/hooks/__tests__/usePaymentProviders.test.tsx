/**
 * TCK-593 — un refus de LIRE les intégrations (403, le cas du locataire) n'est pas une absence de
 * fournisseur. Rendre `[]` masquait « Payer » à la seule personne qui paie ; on rend `undefined`
 * (« inconnu »), et le sélecteur s'en tient aux règles de devise.
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { usePaymentProviders } from '../usePaymentProviders';

const useApiQuery = vi.fn();
vi.mock('@/hooks/useApiQuery', () => ({ useApiQuery: (...a: unknown[]) => useApiQuery(...a) }));

beforeEach(() => useApiQuery.mockReset());

describe('usePaymentProviders', () => {
  it('rend les fournisseurs actifs de l’agence', () => {
    useApiQuery.mockReturnValue({
      data: { data: [{ id: 1, provider: 'wave', agency_id: 3, is_active: true }] },
      error: null,
      isLoading: false,
    });
    expect(renderHook(() => usePaymentProviders(3)).result.current.providers).toEqual(['wave']);
  });

  it('un 403 rend « inconnu » (undefined), pas une liste vide', () => {
    useApiQuery.mockReturnValue({ data: undefined, error: new ApiError(403, null), isLoading: false });
    expect(renderHook(() => usePaymentProviders(3)).result.current.providers).toBeUndefined();
  });

  it('une autre erreur reste une liste vide', () => {
    useApiQuery.mockReturnValue({ data: undefined, error: new ApiError(500, null), isLoading: false });
    expect(renderHook(() => usePaymentProviders(3)).result.current.providers).toEqual([]);
  });
});
