import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-712 (P02.05) — `fetchCrmTags` rendait toujours une liste vide : l'API refusait en 400 le
 * `fields[tags]=…,usage_count` (un compte, pas une colonne), et l'appelant masque l'erreur par
 * `.catch(() => [])`. Le compte se TRIE (`sort=-usage_count`, servi par l'API depuis TCK-712), il
 * ne se demande pas comme colonne. Le contrat côté API : `tests/Feature/Tags/TagCrmSuggestionsTest`.
 */
const api = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  apiRequest: api.apiRequest,
}));

import { fetchCrmTags } from '../customers';

beforeEach(() => {
  api.apiRequest.mockReset();
  api.apiRequest.mockResolvedValue({ data: [] });
});

describe('fetchCrmTags', () => {
  it('trie par usage sans demander le compte comme colonne', async () => {
    await fetchCrmTags('jeton');

    const [chemin] = api.apiRequest.mock.calls[0] as [string];
    const params = new URL(chemin, 'http://x').searchParams;

    expect(params.get('fields[tags]')).toBe('id,name,slug,color');
    expect(params.get('sort')).toBe('-usage_count');
    expect(params.get('filter[type]')).toBe('crm');
  });
});
