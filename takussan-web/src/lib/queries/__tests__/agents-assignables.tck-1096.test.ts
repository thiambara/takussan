import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockApiRequest = vi.fn();

vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  // `buildQueryString` reste le vrai : on éprouve l'URL qu'il produit.
  return { ...reel, apiRequest: (...args: unknown[]) => mockApiRequest(...args) };
});

const { fetchAgencyAgents } = await import('@/lib/queries/agent-crm');

/**
 * P88.03 (TCK-1096) — les sélecteurs de référent, de repreneur et de remplaçant ne proposent que
 * les cibles que l'API accepte : `filter[assignable]=1` écarte les comptes bloqués, les profils
 * suspendus et les bailleurs agents ailleurs. L'onglet d'équipe, lui, ne l'envoie pas.
 */
describe('fetchAgencyAgents', () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
    mockApiRequest.mockResolvedValue({ data: [{ id: 7, first_name: 'Moussa', last_name: 'Fall' }], meta: {} });
  });

  it('demande les agents assignables de l’agence', async () => {
    const agents = await fetchAgencyAgents('jeton', 12);

    const url = String(mockApiRequest.mock.calls[0][0]);
    expect(url.startsWith('/api/agencies/12/members?')).toBe(true);
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('filter[role]')).toBe('agent');
    expect(params.get('filter[assignable]')).toBe('1');
    expect(agents).toEqual([{ id: 7, name: 'Moussa Fall' }]);
  });
});
