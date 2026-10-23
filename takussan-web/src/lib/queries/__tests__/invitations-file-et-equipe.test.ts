/**
 * TCK-1517 (P167.06) — la file « Invitations sans réponse » mène à `/app/agency/team`, dont la
 * section des invitations liste `sent` ET `expired` depuis TCK-368. La file compte la même règle,
 * tirée de la même constante : les deux écrans lisent la même donnée et ne peuvent se contredire.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockApiRequest = vi.fn();
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiRequest: (...args: unknown[]) => mockApiRequest(...args) };
});

const { fetchPendingAgencyInvitations } = await import('@/lib/queries/agency-invitations');
const { fetchPendingInvitationsCount } = await import('@/lib/queries/agency-queues');

function statutDemande(appel: number): string | null {
  const url = String(mockApiRequest.mock.calls[appel][0]);
  return new URLSearchParams(url.split('?')[1]).get('filter[status]');
}

describe('Invitations — la file compte ce que l’équipe liste (TCK-1517)', () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
    mockApiRequest.mockResolvedValue({ data: [], meta: { current_page: 1, last_page: 1, per_page: 1, total: 0 } });
  });

  it('les deux lectures envoient le même filter[status], expirées comprises', async () => {
    await fetchPendingInvitationsCount('jeton');
    await fetchPendingAgencyInvitations('jeton');

    expect(statutDemande(0)).toBe(statutDemande(1));
    expect(statutDemande(0)).toBe('sent,expired');
  });
});
