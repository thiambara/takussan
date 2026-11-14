/**
 * TCK-2791 — les vues d’ensemble sous « Mois dernier » : la période transmise à l’API (filtrée par elle, jamais
 * côté navigateur), les états du jour marqués, « Équipe » sur le mois servi, la portée qui garde la période.
 */
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
const releve = vi.hoisted(() => ({ equipes: [] as { periode: string; moisDernier?: boolean }[], graphes: [] as (string | null)[], series: [] as { id: string }[][], equipe: 0, amorcees: [] as unknown[][], miseEnService: [] as (number | null)[] }));
vi.mock('../GraphiquesDuRapport', () => ({
  GraphiquesDuRapport: ({ series, moisEnCours }: { series: { id: string }[]; moisEnCours: string | null }) => {
    releve.series.push(series);
    releve.graphes.push(moisEnCours);
    return null;
  },
}));
vi.mock('../EquipeDuMois', () => ({
  EquipeDuMois: (props: { periode: string; moisDernier?: boolean }) => {
    releve.equipe += 1;
    releve.equipes.push(props);
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
// TCK-2801 — les seuils des alertes actives (« seuil d’alerte » sous le taux d’impayés).
vi.mock('@/lib/queries/alerts', () => ({ fetchThresholdAlerts: vi.fn(async () => ({ data: [] })) }));
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
const { EnsembleAgent } = await import('../EnsembleAgent');
const { EnsembleBailleur } = await import('../EnsembleBailleur');
const { fetchAgentDashboard } = await import('@/lib/queries/dashboard');

const ETATS_AGENCE = [
  'properties.total', 'properties.published', 'leases.active', 'customers_count', 'members_count', 'bookings.pending', 'maintenance.open',
  'finance.overdue_count', 'finance.overdue_amount', 'finance.unpaid_rate_percent', 'occupancy.rate_percent',
];
const AGENCE_OCTOBRE = {
  data: {
    period: { start: '2026-10-01T00:00:00+00:00', end: '2026-10-31T23:59:59+00:00', key: 'last_month', as_of_today: ETATS_AGENCE },
    properties: { total: 42, published: 31 },
    leases: { active: 18 },
    finance: { revenue_month: 3_300_000, overdue_count: 3, overdue_amount: 450_000, unpaid_rate_percent: 7, commission_month: 0 },
    occupancy: { rate_percent: 78, eligible_count: 23, occupied_count: 18 },
    customers_count: 120,
    members_count: 6,
    bookings: { pending: 2 },
    maintenance: { open: 4 },
  },
  timeseries: { months: ['2026-09', '2026-10', '2026-11'], revenue: [3_000_000, 3_300_000, 200_000], occupancy: [70, 78, 78], short_stay_occupancy: [null, null, null] },
};
const ADMIN = { persona: 'admin-agence', modulesMasques: [], cheminsAdmin: ['/app/agency/team'], capacites: ['reports.view_agency'] };
const tuile = (cle: string) => document.querySelector(`[data-chiffre="${cle}"]`)?.textContent ?? '';

beforeEach(() => {
  releve.series = [];
  releve.graphes = [];
  releve.equipes = [];
  releve.equipe = 0;
  vi.mocked(fetchDashboardAgency).mockReset();
  vi.mocked(fetchDashboardAgency).mockResolvedValue(AGENCE_OCTOBRE as never);
  vi.mocked(fetchAgentDashboard).mockClear();
  vi.mocked(lireLeContexteDesRapports).mockResolvedValue(ADMIN as never);
});

describe('TCK-2791 — la vue d’ensemble de l’admin sous « Mois dernier »', () => {
  it('lit `period=last_month` ; « Chiffres clés · mois dernier » ; octobre comparé à septembre ; les états du jour le disent', async () => {
    render(withIntl(await EnsembleAgence({ periode: 'last_month' })));
    expect(vi.mocked(fetchDashboardAgency).mock.calls).toEqual([[{ withTimeseries: true, period: 'last_month' }]]);
    expect(screen.getByRole('heading', { name: 'Chiffres clés · mois dernier' })).toBeTruthy();
    expect(tuile('encaisse')).toMatch(/\+10 % sur septembre$/);
    for (const cle of ['impayes', 'occupation', 'bauxActifs', 'biensPublies', 'tauxImpayes', 'bookings', 'maintenance', 'customers', 'team']) {
      expect(tuile(cle), cle).toMatch(/aujourd’hui$/);
    }
    expect(tuile('encaisse')).not.toMatch(/aujourd’hui/);
    expect(tuile('commission')).not.toMatch(/aujourd’hui/);
  });

  it('« Équipe » lit octobre et le dit ; les graphiques gardent novembre comme mois en cours', async () => {
    render(withIntl(await EnsembleAgence({ periode: 'last_month' })));
    expect(releve.equipes).toEqual([expect.objectContaining({ periode: '2026-10', moisDernier: true })]);
    expect(releve.graphes).toEqual(['2026-11']);
  });

  it('sous le mois en cours : la lecture d’avant, à l’identique, sans aucune marque', async () => {
    vi.mocked(fetchDashboardAgency).mockResolvedValue({
      ...AGENCE_OCTOBRE,
      data: { ...AGENCE_OCTOBRE.data, period: { start: '2026-11-01T00:00:00+00:00', end: '2026-11-30T23:59:59+00:00', key: 'current_month', as_of_today: ETATS_AGENCE } },
    } as never);
    render(withIntl(await EnsembleAgence()));
    expect(vi.mocked(fetchDashboardAgency).mock.calls).toEqual([[{ withTimeseries: true }]]);
    expect(screen.getByRole('heading', { name: 'Chiffres clés · ce mois' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/aujourd’hui/);
    expect(releve.equipes).toEqual([expect.objectContaining({ periode: '2026-11', moisDernier: false })]);
  });
});

describe('TCK-2791 — l’agent et le bailleur', () => {
  it('l’agent : la portée lue avec la période ; la bascule « Moi / Agence » garde le mois dernier', async () => {
    vi.mocked(capacitesDuProfilActif).mockResolvedValue(['reports.view_agency']);
    render(withIntl(await EnsembleAgent({ scope: 'agency', periode: 'last_month' })));
    expect(vi.mocked(fetchAgentDashboard).mock.calls).toEqual([[{ scope: 'agency', period: 'last_month' }]]);
    const bascule = screen.getByRole('navigation');
    expect([...bascule.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
      '/app/reports?period=last_month',
      '/app/reports?scope=agency&period=last_month',
    ]);
  });

  it('le bailleur : `period=last_month` transmis, le mois en cours ne transmet rien', async () => {
    vi.mocked(fetchOwnerDashboard).mockResolvedValue({
      data: { period: { start: '2026-10-01T00:00:00+00:00', end: '2026-10-31T23:59:59+00:00', key: 'last_month', as_of_today: ['leases.active'] }, portfolio: { total: 3, rented: 1, available: 2 }, leases: { active: 1 }, finance: { cashflow_month: 1, expected_monthly: 2, overdue_count: 0, overdue_amount: 0 } },
    } as never);
    render(withIntl(await EnsembleBailleur({ periode: 'last_month' })));
    expect(vi.mocked(fetchOwnerDashboard).mock.calls.at(-1)).toEqual([{ period: 'last_month' }]);
    expect(tuile('bauxActifs')).toMatch(/aujourd’hui$/);
    render(withIntl(await EnsembleBailleur()));
    expect(vi.mocked(fetchOwnerDashboard).mock.calls.at(-1)).toEqual([undefined]);
  });
});
