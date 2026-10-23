/**
 * TCK-1733 (P167.04) — « Tâches du jour » compte les tâches qui me sont assignées dans l'agence
 * active : la liste qu'ouvre la tuile envoie cette portée à l'API (`filter[assigned_to]=me`), en plus
 * de l'échéance. Sans elle, la liste montrait aussi les tâches créées pour d'autres.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

const { fetchMyTasks } = await import('../agent-crm');

describe('fetchMyTasks — la portée « assignées à moi » (TCK-1733)', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockResolvedValue({ data: [], meta: { current_page: 1, last_page: 1, per_page: 30, total: 0 } });
  });

  it('envoie filter[assigned_to]=me quand la portée est demandée', async () => {
    await fetchMyTasks('jeton', 'today', 1, true);

    const url = decodeURIComponent(String(apiRequest.mock.calls[0]?.[0]));
    expect(url).toContain('filter[due]=today');
    expect(url).toContain('filter[assigned_to]=me');
  });

  it('ne l’envoie pas sans elle', async () => {
    await fetchMyTasks('jeton', 'today', 1, false);

    expect(decodeURIComponent(String(apiRequest.mock.calls[0]?.[0]))).not.toContain('assigned_to');
  });
});
