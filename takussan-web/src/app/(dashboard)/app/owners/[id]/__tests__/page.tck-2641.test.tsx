/**
 * TCK-2641 (3a) — la fiche d'un bailleur est celle de l'admin de l'agence : le LAYOUT du segment rend
 * `notFound()` à un agent sans que l'API soit lue, et à un bailleur que l'API ne rend pas (404) ; une
 * autre panne passe à la page. La page lit le mois de `?period=`, borné au mois en cours, et les
 * droits du profil actif.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getMeAction } from '@/app/actions/auth';
import { capacitesDuProfilActif } from '@/lib/access/pages-admin-server';
import { exigerRessource } from '@/lib/detail/ressource-de-detail';
import { lireBailleurDuRendu } from '@/lib/owners/fiche-du-rendu';
import { fetchDashboardProperties } from '@/lib/queries/properties-server';

const NOT_FOUND = new Error('NEXT_NOT_FOUND');
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw NOT_FOUND; }),
  redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT'); }),
}));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: vi.fn() }));
vi.mock('@/lib/session', () => ({ getToken: vi.fn(async () => 'jeton') }));
vi.mock('@/lib/access/pages-admin-server', () => ({ capacitesDuProfilActif: vi.fn(async () => []) }));
vi.mock('@/lib/owners/fiche-du-rendu', () => ({ lireBailleurDuRendu: vi.fn() }));
vi.mock('@/lib/detail/ressource-de-detail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/detail/ressource-de-detail')>()),
  exigerRessource: vi.fn(async () => 5),
}));
vi.mock('@/lib/queries/properties-server', () => ({ fetchDashboardProperties: vi.fn(async () => ({ data: [] })) }));
vi.mock('@/components/owners/fiche/FicheDuBailleur', () => ({
  FicheDuBailleur: ({ period, droits }: { period: string; droits: Record<string, boolean> }) => (
    <p>
      {period} · {Object.entries(droits).filter(([, v]) => v).map(([k]) => k).join(',')}
    </p>
  ),
}));

import Layout from '../layout';
import Page from '../page';

const agent = { id: 3, agency_id: 7, roles: ['agent', 'customer'] };
const admin = { id: 2, agency_id: 7, roles: ['agency_admin', 'customer'] };
const owner = { id: 5, user_id: 9, agency_id: 7, status: 'active' };

const params = () => Promise.resolve({ id: '5' });
const avec = (period?: string) => Promise.resolve(period ? { period } : {});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(lireBailleurDuRendu).mockResolvedValue({ data: owner } as never);
  vi.mocked(capacitesDuProfilActif).mockResolvedValue(['owners.update', 'payouts.create', 'team.suspend']);
  vi.useFakeTimers({ now: new Date('2026-11-12T10:00:00Z'), toFake: ['Date'] });
});
afterEach(() => vi.useRealTimers());

describe('owners/[id]/layout — le refus et l’introuvable, là où ils rendent 404', () => {
  it('un agent reçoit notFound(), sans sonder l’API', async () => {
    vi.mocked(getMeAction).mockResolvedValue(agent as never);
    await expect(Layout({ params: params(), children: null })).rejects.toBe(NOT_FOUND);
    expect(exigerRessource).not.toHaveBeenCalled();
  });

  it('l’admin passe, et l’existence se juge par la sonde du segment `owners` (404 → introuvable, TCK-442)', async () => {
    vi.mocked(getMeAction).mockResolvedValue(admin as never);
    render(await Layout({ params: params(), children: <p>fiche</p> }));
    expect(screen.getByText('fiche')).toBeInTheDocument();
    expect(exigerRessource).toHaveBeenCalledWith('owners', '5');
  });
});

describe('/app/owners/[id] — la page', () => {
  it('le mois de ?period= est lu ; absent, mal formé ou à venir, c’est le mois en cours, lu sans period', async () => {
    vi.mocked(getMeAction).mockResolvedValue(admin as never);
    for (const [demande, attendu, envoye] of [
      ['2026-09', '2026-09', '2026-09'],
      [undefined, '2026-11', undefined],
      ['2026-13', '2026-11', undefined],
      ['2026-12', '2026-11', undefined],
      ['2026-11', '2026-11', undefined],
    ] as const) {
      vi.mocked(lireBailleurDuRendu).mockClear();
      render((await Page({ params: params(), searchParams: avec(demande) }))!);
      // Le mois en cours : DEUX arguments, ceux de la sonde du layout, pour partager la promesse.
      expect(vi.mocked(lireBailleurDuRendu).mock.calls[0]).toEqual(envoye ? ['jeton', 5, envoye] : ['jeton', 5]);
      expect(screen.getByText(new RegExp(`^${attendu} ·`))).toBeInTheDocument();
      document.body.innerHTML = '';
    }
  });

  it('les droits suivent les capacités du profil actif ; les biens sont ceux du bailleur', async () => {
    vi.mocked(getMeAction).mockResolvedValue(admin as never);
    vi.mocked(capacitesDuProfilActif).mockResolvedValue(['payouts.create']);
    render((await Page({ params: params(), searchParams: avec() }))!);
    // TCK-2753 — `depart` : l'admin actif de l'agence, celui que le layout laisse passer.
    expect(screen.getByText('2026-11 · reversement,depart,sensible')).toBeInTheDocument();
    expect(fetchDashboardProperties).toHaveBeenCalledWith('jeton', expect.objectContaining({ filters: { user_id: '9' }, inclusions: ['occupancy'] }));
  });
});
