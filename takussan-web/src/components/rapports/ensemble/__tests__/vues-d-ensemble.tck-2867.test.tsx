/**
 * TCK-2867 — les vues d’ensemble sous « 12 mois » (la période transmise à l’API, la ligne et le titre qui la disent,
 * l’équipe et les variations qui restent au mois), la série « Impayés », « Agence ▾ » au téléphone, « Demandes en
 * attente » et l’« Attendu » du bailleur.
 */
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
const releve = vi.hoisted(() => ({
  equipes: [] as { periode: string; moisDernier?: boolean }[],
  graphes: [] as (string | null)[],
  series: [] as { id: string; attendu?: unknown; telephoneSeulement?: boolean }[][],
  equipe: 0,
  amorcees: [] as unknown[][],
  miseEnService: [] as (number | null)[],
  demandes: [] as { titre?: string; landlordId: number; hote: unknown }[],
  agences: [] as { nom: string; variante: string }[],
}));
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
vi.mock('../DetailParBail', () => ({ DetailParBail: () => null }));
vi.mock('@/components/accueil/bailleur/AFaireBailleur', () => ({
  AFaireBailleur: (props: { titre?: string; landlordId: number; hote: unknown }) => {
    releve.demandes.push(props);
    return <section data-testid="demandes">{props.titre}</section>;
  },
}));
vi.mock('@/components/rapports/ChoixDeLAgence', () => ({
  ChoixDeLAgence: (props: { nom: string; variante: string }) => {
    releve.agences.push(props);
    return null;
  },
}));
vi.mock('@/components/rapports/vues/LienDesIndicateurs', () => ({ LienDesIndicateurs: () => null }));
vi.mock('@/app/actions/auth', () => ({ getMeAction: vi.fn(async () => ({ id: 3, roles: ['agency_admin'], agency_id: 1 })) }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/access/server-guards', () => ({ resolveAgencyOrNull: async () => ({ id: 1, kind: 'standard', name: 'Dakar Immo' }) }));
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
      period: { start: '2025-12-01T00:00:00+00:00', end: '2026-11-30T23:59:59+00:00', key: 'last_12_months', months: ['2026-10', '2026-11'], as_of_today: [] },
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

const DOUZE = ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
const AGENCE_DOUZE_MOIS = {
  data: {
    period: { start: '2025-12-01T00:00:00+00:00', end: '2026-11-30T23:59:59+00:00', key: 'last_12_months', months: DOUZE, as_of_today: ['finance.overdue_amount'] },
    properties: { total: 42, published: 31 },
    leases: { active: 18 },
    finance: { revenue_month: 40_000_000, overdue_count: 3, overdue_amount: 450_000, unpaid_rate_percent: 7, commission_month: 0 },
    occupancy: { rate_percent: 78, eligible_count: 23, occupied_count: 18 },
    customers_count: 120,
    members_count: 6,
    bookings: { pending: 2 },
    maintenance: { open: 4 },
  },
  timeseries: {
    months: DOUZE,
    revenue: DOUZE.map((_, i) => 3_000_000 + i * 100_000),
    occupancy: DOUZE.map(() => 78),
    overdue: DOUZE.map((_, i) => 400_000 + i * 10_000),
  },
};
const ADMIN = { persona: 'admin-agence', modulesMasques: [], cheminsAdmin: ['/app/agency/team'], capacites: ['reports.view_agency'] };
const tuile = (cle: string) => document.querySelector(`[data-chiffre="${cle}"]`)?.textContent ?? '';

beforeEach(() => {
  releve.series = [];
  releve.graphes = [];
  releve.equipes = [];
  releve.equipe = 0;
  releve.demandes = [];
  releve.agences = [];
  vi.mocked(fetchDashboardAgency).mockReset();
  vi.mocked(fetchDashboardAgency).mockResolvedValue(AGENCE_DOUZE_MOIS as never);
  vi.mocked(lireLeContexteDesRapports).mockResolvedValue(ADMIN as never);
});

describe('TCK-2867 — AC2 : « 12 mois » sur la vue d’ensemble de l’admin', () => {
  it('lit `period=last_12_months`, la ligne de période dit les douze mois, « Chiffres clés · 12 mois »', async () => {
    render(withIntl(await EnsembleAgence({ periode: 'last_12_months' })));
    expect(vi.mocked(fetchDashboardAgency).mock.calls).toEqual([[{ withTimeseries: true, period: 'last_12_months' }]]);
    expect(screen.getByText('Du 1 décembre 2025 au 30 novembre 2026')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Chiffres clés · 12 mois' })).toBeTruthy();
    // L'encaissé des douze mois ne se compare pas à un mois : aucune variation mensuelle sur la tuile.
    expect(tuile('encaisse')).not.toMatch(/%/);
    // La commission de l'agence est celle des douze mois : son libellé le dit.
    expect(tuile('commission')).toMatch(/^Commissions · 12 mois/);
  });

  it('« Équipe » lit le mois EN COURS (team-performance ne lit qu’un mois), le mois en cours est le dernier des douze', async () => {
    render(withIntl(await EnsembleAgence({ periode: 'last_12_months' })));
    expect(releve.equipes).toEqual([expect.objectContaining({ periode: '2026-11', moisDernier: false })]);
    expect(releve.graphes).toEqual(['2026-11']);
  });

  it('AC5 — la série « Impayés » rejoint le segment, au téléphone seulement', async () => {
    render(withIntl(await EnsembleAgence()));
    expect(releve.series[0]?.map((s) => s.id)).toEqual(['encaisse', 'occupation', 'impayes']);
    expect(releve.series[0]?.[2]).toEqual(expect.objectContaining({ telephoneSeulement: true }));
  });

  it('AC4 — l’admin : « Agence ▾ » au téléphone, à côté de la période, au nom de l’agence', async () => {
    render(withIntl(await EnsembleAgence()));
    expect(releve.agences).toEqual([{ nom: 'Dakar Immo', variante: 'ligne' }]);
  });
});

describe('TCK-2867 — l’agent et le bailleur sous « 12 mois »', () => {
  it('l’agent : « Baux signés » est la somme des douze mois', async () => {
    render(withIntl(await EnsembleAgent({ periode: 'last_12_months' })));
    expect(vi.mocked(fetchAgentDashboard).mock.calls.at(-1)).toEqual([{ scope: 'mine', period: 'last_12_months' }]);
    expect(tuile('bauxSignes')).toMatch(/^Baux signés3$/);
  });

  it('AC7 — le bailleur : « Demandes en attente » (le bloc de l’accueil) et l’« Attendu » sur l’encaissé ; sous « 12 mois », l’attendu des douze mois', async () => {
    vi.mocked(fetchOwnerDashboard).mockResolvedValue({
      data: {
        period: { start: '2025-12-01T00:00:00+00:00', end: '2026-11-30T23:59:59+00:00', key: 'last_12_months', months: ['2026-10', '2026-11'], as_of_today: [] },
        portfolio: { total: 5, rented: 5, available: 0 },
        leases: { active: 5 },
        finance: { cashflow_month: 1_900_000, expected_monthly: 1_200_000, overdue_count: 0, overdue_amount: 0 },
        occupancy: { rate_percent: 100, eligible_count: 5, occupied_count: 5 },
        bookings: { pending: 1 },
        reviews: { unanswered: 3 },
      },
      timeseries: { months: ['2026-10', '2026-11'], cashflow: [900_000, 1_000_000], expected: [1_000_000, 1_200_000], occupancy: [100, 100] },
    } as never);
    render(withIntl(await EnsembleBailleur({ periode: 'last_12_months' })));
    expect(vi.mocked(fetchOwnerDashboard).mock.calls.at(-1)).toEqual([{ period: 'last_12_months' }]);
    expect(screen.getByTestId('demandes').textContent).toBe('Demandes en attente');
    expect(releve.demandes).toEqual([{ titre: 'Demandes en attente', landlordId: 3, hote: null }]);
    expect(releve.series[0]?.[0]).toEqual(expect.objectContaining({ id: 'cashflow', attendu: [1_000_000, 1_200_000] }));
    // « sur … attendus » : l'attendu des mêmes douze mois, jamais le loyer d'un mois.
    expect(tuile('encaisse')).toMatch(/sur 2,2\sM\sF attendus$/);
  });

  it('l’hôte : ses deux files (réservations, avis) passent au bloc, lues du même tableau de bord', async () => {
    vi.mocked(lireLeContexteDesRapports).mockResolvedValue({ persona: 'hote', modulesMasques: [], cheminsAdmin: [], capacites: [] } as never);
    vi.mocked(fetchOwnerDashboard).mockResolvedValue({
      data: {
        period: { start: '2026-11-01', end: '2026-11-30' },
        portfolio: { total: 1, rented: 1, available: 0 },
        finance: { cashflow_month: 0, expected_monthly: 0, overdue_count: 0, overdue_amount: 0 },
        bookings: { pending: 2 },
        reviews: { unanswered: 4 },
      },
    } as never);
    render(withIntl(await EnsembleBailleur()));
    expect(releve.demandes[0]?.hote).toEqual({ reservations: { etat: 'pret', total: 2 }, avis: { etat: 'pret', total: 4 } });
  });
});
