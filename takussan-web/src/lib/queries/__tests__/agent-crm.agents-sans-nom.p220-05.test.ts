/**
 * P220.05 (TCK-2140) — `fetchAgencyAgents` nomme un agent par `nomAffichable()`. La requête ne
 * demande que `id`, `first_name` et `last_name` (aucun champ de contact neuf) : un agent sans nom
 * retombe donc sur `#<id>`. Avant, son `name` valait `''`, et la passation, les absences et le
 * référent d'une fiche proposaient une option vide.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

const { fetchAgencyAgents } = await import('../agent-crm');

describe('fetchAgencyAgents — agent sans nom (P220.05)', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockResolvedValue({
      data: [
        { id: 12, first_name: '', last_name: '' },
        { id: 13, first_name: 'Awa', last_name: null },
      ],
    });
  });

  it('retombe sur #<id>, et garde le nom connu', async () => {
    expect(await fetchAgencyAgents('jeton', 3)).toEqual([
      { id: 12, name: '#12' },
      { id: 13, name: 'Awa' },
    ]);
  });

  it('ne demande aucun champ de contact', async () => {
    await fetchAgencyAgents('jeton', 3);

    const url = decodeURIComponent(String(apiRequest.mock.calls[0]?.[0]));
    expect(url).toContain('fields[users]=id,first_name,last_name');
  });
});
