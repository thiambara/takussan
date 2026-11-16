/**
 * TCK-2908 — les choix de « Tous les bailleurs » : les profils de l'agence, TOUTES les pages, sans filtre de
 * statut (un brouillon d'invitation a ses biens saisis) ; la valeur est l'identifiant du PROFIL — celui
 * qu'attend `filter[owner_profile_id]` (TCK-2905) —, jamais celui du compte ; un invité sans compte est nommé
 * d'après son invitation (`metadata`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...a: unknown[]) => apiRequest(...a),
}));

const { fetchBailleursDuFiltre } = await import('../bailleurs-du-filtre');

beforeEach(() => apiRequest.mockReset());

describe('fetchBailleursDuFiltre (TCK-2908)', () => {
  it('lit les profils de l’agence sans filtre de statut, invités compris, valeur = profil', async () => {
    apiRequest
      .mockResolvedValueOnce({
        data: [{ id: 31, user_id: 500, metadata: null, user: { id: 500, first_name: 'Fatou', last_name: 'Ndiaye', email: 'f@x.sn' } }],
        meta: { current_page: 1, last_page: 2, per_page: 100, total: 2 },
      })
      .mockResolvedValueOnce({
        data: [{ id: 40, user_id: null, metadata: { first_name: 'Awa', last_name: 'Ba', email: 'awa@x.sn' }, user: null }],
        meta: { current_page: 2, last_page: 2, per_page: 100, total: 2 },
      });

    const bailleurs = await fetchBailleursDuFiltre('jeton', 3);

    expect(bailleurs).toEqual([
      { id: 40, name: 'Awa Ba' },
      { id: 31, name: 'Fatou Ndiaye' },
    ]);
    expect(apiRequest).toHaveBeenCalledTimes(2);
    const url = decodeURIComponent(String(apiRequest.mock.calls[0][0]));
    expect(url).toContain('filter[agency_id]=3');
    expect(url).not.toContain('filter[status]');
    expect(url).toContain('include=user');
    expect(url).toContain('per_page=100');
    expect(apiRequest.mock.calls[0][1]).toMatchObject({ token: 'jeton' });
  });
});
