import { beforeEach, describe, expect, it, vi } from 'vitest';

import { capacitesDuProfilActif } from '@/lib/access/pages-admin-server';
import { fetchAgentDashboard } from '@/lib/queries/dashboard';

import { lireLeTableauDeLAgent } from '../tableau-de-l-agent';

/**
 * TCK-595 (ADR-0049 §4) et TCK-1376 (P138.07), portés de `overview/__tests__/agent-portee.tck-595` et
 * `agent-capacites-du-rendu.tck-1376` quand la vue de l'agent est devenue un onglet de « Rapports » (TCK-2628) :
 * « Agence » seulement sous `reports.view_agency`, lue sous le profil actif ; une panne vaut l'absence.
 */
vi.mock('@/lib/access/pages-admin-server', () => ({ capacitesDuProfilActif: vi.fn() }));
vi.mock('@/lib/queries/dashboard', () => ({
  fetchAgentDashboard: vi.fn(async (opts: { scope: string }) => ({ data: { scope: opts.scope } })),
}));

beforeEach(() => {
  vi.mocked(fetchAgentDashboard).mockClear();
});

describe('lireLeTableauDeLAgent', () => {
  it('sans la capacité : pas de bascule, et « agency » demandé à la main retombe sur « mine »', async () => {
    vi.mocked(capacitesDuProfilActif).mockResolvedValue([]);
    const lu = await lireLeTableauDeLAgent('agency');
    expect(vi.mocked(fetchAgentDashboard).mock.calls).toEqual([[{ scope: 'mine' }]]);
    expect(lu).toMatchObject({ peutVoirAgence: false, agence: false });
  });

  it('avec reports.view_agency : la bascule, et « Agence » lit les chiffres de l’agence', async () => {
    vi.mocked(capacitesDuProfilActif).mockResolvedValue(['reports.view_agency']);
    const lu = await lireLeTableauDeLAgent('agency');
    expect(vi.mocked(fetchAgentDashboard).mock.calls).toEqual([[{ scope: 'agency' }]]);
    expect(lu).toMatchObject({ peutVoirAgence: true, agence: true });
  });

  it('avec la capacité mais sans `?scope=agency` : « Mes chiffres » par défaut', async () => {
    vi.mocked(capacitesDuProfilActif).mockResolvedValue(['reports.view_agency']);
    expect(await lireLeTableauDeLAgent(undefined)).toMatchObject({ peutVoirAgence: true, agence: false });
    expect(vi.mocked(fetchAgentDashboard).mock.calls).toEqual([[{ scope: 'mine' }]]);
  });

  it('TCK-1376 — une panne de lecture des capacités : pas de bascule, la vue personnelle', async () => {
    vi.mocked(capacitesDuProfilActif).mockResolvedValue(null);
    expect(await lireLeTableauDeLAgent('agency')).toMatchObject({ peutVoirAgence: false, agence: false });
    expect(vi.mocked(fetchAgentDashboard).mock.calls).toEqual([[{ scope: 'mine' }]]);
  });

  it('la portée servie est celle que l’API a appliquée', async () => {
    vi.mocked(capacitesDuProfilActif).mockResolvedValue(['reports.view_agency']);
    vi.mocked(fetchAgentDashboard).mockResolvedValueOnce({ data: { scope: 'mine' } } as never);
    expect(await lireLeTableauDeLAgent('agency')).toMatchObject({ agence: false });
  });
});
