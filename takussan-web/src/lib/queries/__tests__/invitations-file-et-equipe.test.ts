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

const { fetchPendingAgencyInvitations, purgeExpiredAgencyInvitations, fetchInvitationDuClient } = await import('@/lib/queries/agency-invitations');
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

/**
 * TCK-2668 — la page Équipe ne suit plus les invitations de locataires : la liste, la file de
 * l'aperçu et la purge « Tout effacer » envoient LE MÊME `filter[role]`, sans `tenant` ; la fiche
 * client lit la sienne par `filter[customer_id]` et `role=tenant`.
 */
describe('Invitations — les rôles d’équipe, partout les mêmes (TCK-2668)', () => {
  const parametres = (appel: number) => new URLSearchParams(String(mockApiRequest.mock.calls[appel][0]).split('?')[1]);

  beforeEach(() => {
    mockApiRequest.mockReset();
    mockApiRequest.mockResolvedValue({ data: [], deleted: 3, meta: { current_page: 1, last_page: 1, per_page: 1, total: 0 } });
  });

  it('liste, file et purge : le même filter[role], sans tenant', async () => {
    await fetchPendingAgencyInvitations('jeton', { statut: 'expired' });
    await fetchPendingInvitationsCount('jeton');
    const efface = await purgeExpiredAgencyInvitations('jeton');

    const roles = [0, 1, 2].map((i) => parametres(i).get('filter[role]'));
    expect(new Set(roles).size).toBe(1);
    expect(roles[0]?.split(',')).toEqual(['owner', 'agent', 'agent_senior', 'agent_manager', 'agency_admin', 'service_provider']);
    // Vérification de 776dc214f (D6) — les expirées au sens de la purge : `filter[expired]=1`.
    expect(parametres(0).get('filter[status]')).toBe('sent,expired');
    expect(parametres(0).get('filter[expired]')).toBe('1');
    expect(String(mockApiRequest.mock.calls[2][0]).startsWith('/api/invitations/expired?')).toBe(true);
    expect(mockApiRequest.mock.calls[2][1]).toMatchObject({ method: 'DELETE', token: 'jeton' });
    expect(efface).toBe(3);
  });

  it('la fiche client lit l’invitation née de la fiche, au rôle tenant', async () => {
    await fetchInvitationDuClient('jeton', 42);
    const p = parametres(0);
    expect(p.get('filter[customer_id]')).toBe('42');
    expect(p.get('filter[role]')).toBe('tenant');
    expect(p.get('filter[status]')).toBe('sent,expired');
    expect(p.get('per_page')).toBe('1');
    // Vérification de TCK-2668 (D1) — sans l'émetteur et la cible, l'API ne sert pas `abilities`.
    expect(p.get('fields[invitations]')?.split(',')).toEqual(expect.arrayContaining(['invited_by', 'invitable_type', 'invitable_id']));
  });
});
