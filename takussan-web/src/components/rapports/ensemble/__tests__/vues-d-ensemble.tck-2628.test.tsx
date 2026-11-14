/**
 * TCK-2628 (L2) — les vues d'ensemble par persona : chacune ses chiffres (liens), une série par graphique,
 * l'occupation avec sa base (AC4), « Équipe ce mois » seulement quand l'onglet Équipe est ouvert, et la
 * portée de l'agent sous `reports.view_agency` seulement.
 */
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getMeAction } from '@/app/actions/auth';
import { capacitesDuProfilActif } from '@/lib/access/pages-admin-server';
import { fetchDashboardAgency } from '@/lib/queries/dashboard-agency';
import { fetchOwnerDashboard } from '@/lib/queries/dashboard';
import { lireLeContexteDesRapports } from '@/lib/rapports/contexte-serveur';
import { withIntl } from '@/test/intl';

// Le vrai formateur (pluriels, interpolation), sur le vrai `fr.json` : le mock commun rend le gabarit brut.
vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  const fr = (await import('@/messages/fr.json')).default;
  return {
    getTranslations: async (namespace?: string) => createTranslator({ locale: 'fr', messages: fr, namespace: namespace as never, timeZone: 'Africa/Dakar' }),
    getLocale: async () => 'fr',
  };
});
vi.mock('@/i18n/locale-serveur', () => ({ localeDeLaRequete: async () => 'fr' }));
const releve = vi.hoisted(() => ({ series: [] as { id: string }[][], equipe: 0, amorcees: [] as unknown[][], miseEnService: [] as (number | null)[] }));
vi.mock('../GraphiquesDuRapport', () => ({
  GraphiquesDuRapport: ({ series }: { series: { id: string }[] }) => {
    releve.series.push(series);
    return null;
  },
}));
vi.mock('../EquipeDuMois', () => ({
  EquipeDuMois: () => {
    releve.equipe += 1;
    return <p>équipe</p>;
  },
}));
vi.mock('@/components/dashboard/admin/MiseEnService', () => ({
  MiseEnService: ({ agencyId }: { agencyId: number | null }) => {
    releve.miseEnService.push(agencyId);
    return <section data-testid="mise-en-service" />;
  },
}));
vi.mock('@/components/providers/AmorceLectures', () => ({
  AmorceLectures: ({ lectures, children }: { lectures: { cle: unknown[] }[]; children: ReactNode }) => {
    releve.amorcees.push(lectures.map((l) => l.cle));
    return <>{children}</>;
  },
}));
vi.mock('@/lib/queries/mise-en-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/mise-en-service')>()),
  fetchMiseEnService: vi.fn(async () => ({ steps: [] })),
}));
vi.mock('@/lib/queries/agency-queues', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/agency-queues')>()),
  fetchPendingInvitationsCount: vi.fn(async () => 4),
}));
vi.mock('../ProchainsReversements', () => ({ ProchainsReversements: () => null }));
vi.mock('@/components/rapports/vues/LienDesIndicateurs', () => ({ LienDesIndicateurs: () => null }));
vi.mock('@/app/actions/auth', () => ({ getMeAction: vi.fn(async () => ({ id: 3, roles: ['agency_admin'], agency_id: 1 })) }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/access/server-guards', () => ({ resolveAgencyOrNull: async () => ({ id: 1, kind: 'standard' }) }));
vi.mock('@/lib/access/pages-admin-server', () => ({ capacitesDuProfilActif: vi.fn(async () => []) }));
vi.mock('@/lib/rapports/contexte-serveur', () => ({ lireLeContexteDesRapports: vi.fn() }));
vi.mock('@/lib/queries/dashboard-agency', () => ({ fetchDashboardAgency: vi.fn() }));
vi.mock('@/lib/queries/dashboard', () => ({
  fetchOwnerDashboard: vi.fn(),
  fetchAgentDashboard: vi.fn(async (opts?: { scope?: string }) => ({
    data: {
      agent_id: 7,
      agency_id: 1,
      scope: opts?.scope ?? 'mine',
      period: { start: '2026-11-01', end: '2026-11-30' },
      pipeline: { lead: 4, qualified: 2, converted: 5, lost: 1 },
      finance: { commissions_month: 150000, commissions_year: 900000 },
      visits: { upcoming_7d: 3 },
      bookings: { pending: 2 },
      pipeline_ops: { pending_bookings: 5, leases_to_sign: 2, tasks_today: 3 },
      recent_activity: [{ type: 'lease', id: 9, label: 'Bail signé — Villa 12', at: '2026-11-12T10:30:00Z' }],
    },
    timeseries: { months: ['2026-10', '2026-11'], commissions: [100000, 150000], signed_leases: [1, 2] },
  })),
}));

const { EnsembleAgence } = await import('../EnsembleAgence');
const { cleMiseEnService } = await import('@/lib/queries/mise-en-service');
const { AGENCY_INVITATIONS_COUNT_KEY } = await import('@/lib/queries/agency-queues');
const { EnsembleAgent } = await import('../EnsembleAgent');
const { OngletDesCommissions } = await import('../OngletDesCommissions');
const { EnsembleBailleur } = await import('../EnsembleBailleur');

const AGENCE = {
  data: {
    period: { start: '2026-11-01', end: '2026-11-30' },
    properties: { total: 42, published: 31 },
    leases: { active: 18 },
    finance: { revenue_month: 3_900_000, overdue_count: 3, overdue_amount: 450_000, unpaid_rate_percent: 7, commission_month: 0 },
    occupancy: { rate_percent: 78, eligible_count: 23, occupied_count: 18 },
    customers_count: 120,
    members_count: 6,
    bookings: { pending: 2 },
    maintenance: { open: 4 },
  },
  timeseries: { months: ['2026-10', '2026-11'], revenue: [3_000_000, 3_900_000], occupancy: [70, 78], short_stay_occupancy: [null, null] },
};
const ADMIN = { persona: 'admin-agence', modulesMasques: [], cheminsAdmin: ['/app/agency/team', '/app/agency/finances'], capacites: ['reports.view_agency'] };

function lienDuChiffre(cle: string) {
  return document.querySelector(`[data-chiffre="${cle}"]`);
}

beforeEach(() => {
  releve.series = [];
  releve.equipe = 0;
  releve.amorcees = [];
  releve.miseEnService = [];
  vi.mocked(fetchDashboardAgency).mockClear();
  vi.mocked(capacitesDuProfilActif).mockResolvedValue([]);
  vi.mocked(fetchDashboardAgency).mockResolvedValue(AGENCE as never);
  vi.mocked(lireLeContexteDesRapports).mockResolvedValue(ADMIN as never);
});

describe('TCK-2628 — la vue d’ensemble de l’admin', () => {
  it('six chiffres-liens, Encaissé et Occupation en deux graphiques, « Équipe ce mois », « En chiffres »', async () => {
    render(withIntl(await EnsembleAgence()));
    expect(within(screen.getAllByRole('list')[0]).getAllByRole('link')).toHaveLength(6);
    expect(releve.series).toEqual([[expect.objectContaining({ id: 'encaisse' }), expect.objectContaining({ id: 'occupation' })]]);
    expect(releve.equipe).toBe(1);
    expect(screen.getByRole('heading', { name: 'En chiffres' })).toBeTruthy();
    expect(lienDuChiffre('team')?.getAttribute('href')).toBe('/app/agency/team');
    expect(lienDuChiffre('impayes')?.getAttribute('href')).toBe('/app/reports/unpaid');
  });

  it('Équipe et Impayés fermés : ni « Équipe ce mois » ni lien vers eux', async () => {
    vi.mocked(lireLeContexteDesRapports).mockResolvedValue({ ...ADMIN, cheminsAdmin: [], capacites: [] } as never);
    render(withIntl(await EnsembleAgence()));
    expect(releve.equipe).toBe(0);
    expect(lienDuChiffre('impayes')?.getAttribute('href')).toBe('/app/payments?status=late');
    expect(lienDuChiffre('team')?.tagName).toBe('DIV');
  });

  it('une lecture en échec : l’état dégradé, pas une exception — la mise en service reste au-dessus', async () => {
    vi.mocked(fetchDashboardAgency).mockResolvedValue(null as never);
    render(withIntl(await EnsembleAgence()));
    expect(releve.series).toEqual([]);
    expect(screen.queryByRole('list')).toBeNull();
    expect(releve.miseEnService).toEqual([1]);
  });

  it('TCK-589 / TCK-1830 — la carte de mise en service en tête, lue au serveur et amorcée avec les invitations', async () => {
    render(withIntl(await EnsembleAgence()));
    expect(releve.miseEnService).toEqual([1]);
    expect(releve.amorcees).toEqual([[cleMiseEnService(1), [...AGENCY_INVITATIONS_COUNT_KEY]]]);
    // Ce qui demande un geste passe avant ce qui décrit un état (TCK-375).
    const carte = screen.getByTestId('mise-en-service');
    expect(carte.compareDocumentPosition(screen.getAllByRole('list')[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('AC2 de TCK-647 — aucun chiffre n’y figure deux fois : « Chiffres clés » et « En chiffres » ne se répètent pas', async () => {
    vi.mocked(fetchDashboardAgency).mockResolvedValueOnce({
      ...AGENCE,
      data: { ...AGENCE.data, finance: { ...AGENCE.data.finance, commission_month: 120_000, late_fees_outstanding_amount: 15_000 } },
    } as never);
    render(withIntl(await EnsembleAgence()));
    const tuiles = [...document.querySelectorAll('[data-chiffre]')];
    const cles = tuiles.map((t) => t.getAttribute('data-chiffre'));
    // Le libellé est le premier nœud texte de la tuile (lu nœud par nœud : `textContent` collerait libellé et valeur).
    const libelles = tuiles.map((t) => t.querySelector('span > span.truncate')?.textContent);
    expect(tuiles).toHaveLength(12);
    expect(new Set(cles).size).toBe(cles.length);
    expect(libelles.every(Boolean)).toBe(true);
    expect(new Set(libelles).size).toBe(libelles.length);
  });

  it('AC3 de TCK-647 — `GET /api/dashboard/agency` lu UNE fois, séries comprises', async () => {
    render(withIntl(await EnsembleAgence()));
    expect(vi.mocked(fetchDashboardAgency).mock.calls).toEqual([[{ withTimeseries: true }]]);
  });

  it('TCK-115 — un super-admin sans agence voit « aucune agence », et rien n’est lu', async () => {
    vi.mocked(getMeAction).mockResolvedValueOnce({ id: 1, roles: ['super_admin'], agency_id: null } as never);
    render(withIntl(await EnsembleAgence()));
    expect(fetchDashboardAgency).not.toHaveBeenCalled();
    expect(releve.miseEnService).toEqual([]);
  });

  it('la commission du mois et les pénalités à recouvrer, reprises de l’ancienne tuile des revenus', async () => {
    vi.mocked(fetchDashboardAgency).mockResolvedValueOnce({
      ...AGENCE,
      data: { ...AGENCE.data, finance: { ...AGENCE.data.finance, commission_month: 120_000, late_fees_outstanding_amount: 15_000 } },
    } as never);
    const { unmount } = render(withIntl(await EnsembleAgence()));
    expect(lienDuChiffre('commission')?.textContent).toMatch(/^Commissions du mois120\sk\sF$/);
    expect(lienDuChiffre('penalites')?.textContent).toMatch(/^Pénalités à recouvrer15\sk\sF$/);
    unmount();
    render(withIntl(await EnsembleAgence()));
    expect(lienDuChiffre('penalites')).toBeNull();
  });
});

describe('TCK-2628 — la vue d’ensemble et les commissions de l’agent', () => {
  it('quatre chiffres, les prospects ouverts, Commissions et Baux signés en DEUX graphiques ; sans capacité, pas de portée', async () => {
    render(withIntl(await EnsembleAgent({})));
    expect(within(screen.getAllByRole('list')[0]).getAllByRole('link')).toHaveLength(4);
    expect(document.querySelector('[data-slot="bloc-pipeline"] .font-display')?.textContent).toBe('6 prospects');
    expect(releve.series).toEqual([[expect.objectContaining({ id: 'commissions' }), expect.objectContaining({ id: 'bauxSignes' })]]);
    expect(screen.queryByRole('navigation', { name: 'Portée des chiffres' })).toBeNull();
  });

  it('avec `reports.view_agency` : la portée, et « Détail par bail » garde « Agence »', async () => {
    vi.mocked(capacitesDuProfilActif).mockResolvedValue(['reports.view_agency']);
    render(withIntl(await EnsembleAgent({ scope: 'agency' })));
    expect(screen.getByRole('navigation', { name: 'Portée des chiffres' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Détail par bail' }).getAttribute('href')).toBe('/app/reports/commissions?scope=agency');
  });

  it('« Priorités » reste : chaque compte mène à la liste qu’il compte (TCK-1735, TCK-1513, TCK-1733), « Activité récente » aussi', async () => {
    render(withIntl(await EnsembleAgent({})));
    const priorites = screen.getByRole('heading', { name: 'Prospects prioritaires' }).parentElement!;
    const liens = within(priorites)
      .getAllByRole('link')
      .map((a) => [a.getAttribute('href'), a.textContent]);
    expect(liens).toEqual([
      ['/app/bookings?only_mine=1', 'Demandes en attente5'],
      ['/app/leases?status=pending_signature', 'Baux à signer2'],
      ['/app/tasks?filter[due]=today&filter[assigned_to]=me', 'Tâches du jour3'],
    ]);
    expect(screen.getByText('Bail signé — Villa 12')).toBeTruthy();
  });

  it('TCK-1735 — sous « Agence », les demandes mènent à la liste de l’agence', async () => {
    vi.mocked(capacitesDuProfilActif).mockResolvedValue(['reports.view_agency']);
    render(withIntl(await EnsembleAgent({ scope: 'agency' })));
    const priorites = screen.getByRole('heading', { name: 'Prospects prioritaires' }).parentElement!;
    expect(within(priorites).getAllByRole('link')[0]!.getAttribute('href')).toBe('/app/bookings');
  });

  it('l’onglet Commissions : deux graphiques d’une série, la portée reste sur l’onglet', async () => {
    vi.mocked(capacitesDuProfilActif).mockResolvedValue(['reports.view_agency']);
    render(withIntl(await OngletDesCommissions({})));
    expect(releve.series).toEqual([[expect.objectContaining({ id: 'commissions' }), expect.objectContaining({ id: 'bauxSignes' })]]);
    expect(screen.getByRole('link', { name: 'Agence' }).getAttribute('href')).toBe('/app/reports/commissions?scope=agency');
  });
});

describe('TCK-2628 — la vue d’ensemble du bailleur', () => {
  const PROPRIO = {
    data: {
      period: { start: '2026-11-01', end: '2026-11-30' },
      portfolio: { total: 59, rented: 5, available: 54 },
      leases: { active: 5 },
      finance: { cashflow_month: 1_000_000, expected_monthly: 1_200_000, overdue_count: 0, overdue_amount: 0 },
      occupancy: { rate_percent: 100, eligible_count: 5, occupied_count: 5 },
    },
    timeseries: { months: ['2026-10', '2026-11'], cashflow: [900_000, 1_000_000], occupancy: [100, 100] },
  };

  it('AC4 — « 5 biens loués sur 5 en location » à côté du taux ; Encaissé et Occupation en deux graphiques', async () => {
    vi.mocked(fetchOwnerDashboard).mockResolvedValue(PROPRIO as never);
    render(withIntl(await EnsembleBailleur()));
    expect(lienDuChiffre('occupation')?.textContent).toMatch(/^Occupation100\s%5 biens loués sur 5 en location$/);
    expect(lienDuChiffre('bauxActifs')).not.toBeNull();
    expect(releve.series).toEqual([[expect.objectContaining({ id: 'cashflow' }), expect.objectContaining({ id: 'occupation' })]]);
  });

  it('AC4 — sans la base, pas de taux : jamais « 100 % » à côté de « 54 libres »', async () => {
    vi.mocked(fetchOwnerDashboard).mockResolvedValue({ ...PROPRIO, data: { ...PROPRIO.data, occupancy: { rate_percent: 100 } } } as never);
    render(withIntl(await EnsembleBailleur()));
    expect(lienDuChiffre('occupation')?.textContent).toBe('Occupation—');
  });

  it('un portefeuille vide garde son invitation : le bailleur hors personnel PROPOSE un bien (TCK-587)', async () => {
    vi.mocked(getMeAction).mockResolvedValueOnce({ id: 9, roles: ['owner'], agency_id: 1 } as never);
    vi.mocked(fetchOwnerDashboard).mockResolvedValue({ ...PROPRIO, data: { ...PROPRIO.data, portfolio: { total: 0, rented: 0, available: 0 } } } as never);
    render(withIntl(await EnsembleBailleur()));
    expect(document.querySelector('a[href="/app/properties/new"]')?.textContent).toBe('Proposer un bien à mon agence');
  });
});
