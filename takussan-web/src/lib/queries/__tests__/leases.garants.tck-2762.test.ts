/**
 * TCK-2762 (AC2) — après l'ajout d'un garant, la fiche relit sa liste : la mutation invalide la clé
 * même que lit `useLeaseGuarantors`, dont dépendent « Parties », « Garant (n) » et la feuille.
 */
import { describe, expect, it, vi } from 'vitest';

const useApiMutation = vi.fn();
const useApiQuery = vi.fn();
vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (...args: unknown[]) => useApiQuery(...args),
  useApiMutation: (...args: unknown[]) => useApiMutation(...args),
}));

const { useCreateGuarantor, useGuarantor, useLeaseGuarantors, useUpdateGuarantor } = await import('../leases');

describe('useCreateGuarantor — ce que l’ajout relit (TCK-2762)', () => {
  it('POST /api/leases/{id}/guarantors, puis la clé de la liste des garants', () => {
    useLeaseGuarantors(4);
    useCreateGuarantor(4);
    const [cleDeLaListe] = useApiQuery.mock.calls[0] as [unknown[]];
    const [requete, options] = useApiMutation.mock.calls[0] as [{ path: string; method: string }, { invalidate: unknown[] }];

    expect(requete).toMatchObject({ path: '/api/leases/4/guarantors', method: 'POST' });
    expect(options.invalidate).toContainEqual(cleDeLaListe);
  });
});

describe('useUpdateGuarantor — ce que la modification relit (TCK-2762)', () => {
  it('PUT /api/guarantors/{id}, puis la liste des garants du bail et la fiche du garant', () => {
    useApiQuery.mockClear();
    useApiMutation.mockClear();
    useLeaseGuarantors(4);
    useGuarantor(7);
    useUpdateGuarantor(7, 4);
    const [cleDeLaListe] = useApiQuery.mock.calls[0] as [unknown[]];
    const [cleDeLaFiche] = useApiQuery.mock.calls[1] as [unknown[]];
    const [requete, options] = useApiMutation.mock.calls[0] as [{ path: string; method: string }, { invalidate: unknown[] }];

    expect(requete).toMatchObject({ path: '/api/guarantors/7', method: 'PUT' });
    expect(options.invalidate).toContainEqual(cleDeLaListe);
    expect(options.invalidate).toContainEqual(cleDeLaFiche);
  });
});
