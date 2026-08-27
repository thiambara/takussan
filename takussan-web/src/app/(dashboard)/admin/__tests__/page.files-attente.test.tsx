import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

/**
 * TCK-375 — ce que la PAGE `/admin` câble, par opposition à ce que le bloc de files sait faire.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * DEUX PROPRIÉTÉS, ET AUCUNE DES DEUX N'EST TESTABLE DANS LE COMPOSANT
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 *  1. **L'ORDRE.** « Les files d'abord » est une propriété du DOM de la page, pas du composant :
 *     `AgencyQueues` rendu isolément est toujours premier. Un test de composant l'aurait déclaré
 *     vert sur une page où le bloc serait resté en bas.
 *  2. **LE COMPTE D'IMPAYÉS VIENT DU SERVEUR.** La page le prend dans `finance.overdue_count` de
 *     la charge déjà chargée. Si quelqu'un le remplaçait un jour par un comptage de liste, ce
 *     test verrait la valeur cesser de suivre la charge.
 *
 * ⚠ **Et une mesure qui contredit l'AC3 du ticket, écrite ici pour qu'elle ne se perde pas.**
 * `/admin` figure dans `PRO_ROUTES` et appelle `ensureStandardAgencyOrRedirect` : une agence
 * `kind=individual` est renvoyée sur `/app` AVANT que quoi que ce soit ne soit rendu. La branche
 * « files sans objet » du bloc est donc INATTEIGNABLE DEPUIS CETTE PAGE aujourd'hui — c'est une
 * garde en profondeur, éprouvée au niveau du composant (`AgencyQueues.test.tsx`), et le dernier
 * test de ce fichier prouve le redirect plutôt que de faire semblant du contraire.
 */

const mockGetMe = vi.fn();
const mockFetchDashboard = vi.fn();
const mockResolveAgency = vi.fn();
const mockEnsureStandard = vi.fn();
const mockRedirect = vi.fn();

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => mockGetMe() }));
vi.mock('@/lib/queries/dashboard-agency', () => ({
  fetchDashboardAgency: (...a: unknown[]) => mockFetchDashboard(...a),
}));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/access/server-guards', () => ({
  ensureStandardAgencyOrRedirect: (...a: unknown[]) => mockEnsureStandard(...a),
  resolveAgencyOrNull: (...a: unknown[]) => mockResolveAgency(...a),
}));
vi.mock('next/navigation', () => ({ redirect: (...a: unknown[]) => mockRedirect(...a) }));

// Les enfants sont remplacés par des marqueurs : ce fichier mesure le CÂBLAGE de la page, pas le
// rendu des blocs — chacun a ses propres tests.
vi.mock('@/components/dashboard/admin/AgencyQueues', () => ({
  AgencyQueues: (p: { overdueCount: number; agencyIsStandard?: boolean; agencyId: number | null }) => (
    <div
      data-testid="bloc-files"
      data-overdue={String(p.overdueCount)}
      data-standard={String(p.agencyIsStandard)}
      data-agency={String(p.agencyId)}
    />
  ),
}));
vi.mock('@/components/dashboard/admin/AgencyKpis', () => ({
  AgencyKpis: () => <div data-testid="bloc-kpis" />,
}));
vi.mock('@/components/dashboard/admin/AgencyActivityFeed', () => ({
  AgencyActivityFeed: () => <div data-testid="bloc-activite" />,
}));
vi.mock('@/components/dashboard/admin/AgencyRevenueSnapshot', () => ({
  AgencyRevenueSnapshot: () => <div data-testid="bloc-revenus" />,
}));

import Page from '../page';

function charge(overdueCount: number) {
  return {
    data: {
      agency_id: 7,
      period: { start: '2026-08-01', end: '2026-08-31' },
      properties: { total: 3, published: 2, rented: 1, available: 1 },
      leases: { active: 1 },
      customers_count: 2,
      members_count: 4,
      bookings: { pending: 0 },
      maintenance: { open: 0 },
      finance: {
        revenue_month: 0,
        commission_month: 0,
        overdue_count: overdueCount,
        overdue_amount: 0,
        unpaid_rate_percent: 0,
      },
      occupancy: { rate_percent: 33 },
    },
    timeseries: { months: [], revenue: [], occupancy: [] },
  };
}

describe('/admin — les files d’attente d’abord (TCK-375)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMe.mockResolvedValue({ id: 1, agency_id: 7, roles: ['agency_admin'] });
    mockEnsureStandard.mockResolvedValue(undefined);
    mockResolveAgency.mockResolvedValue({ id: 7, kind: 'standard' });
    mockFetchDashboard.mockResolvedValue(charge(5));
  });

  it('monte le bloc de files AVANT les KPI', async () => {
    render(withIntl(await Page()));

    const files = screen.getByTestId('bloc-files');
    const kpis = screen.getByTestId('bloc-kpis');

    // `compareDocumentPosition` répond sur l'ordre du DOM, sans dépendre d'une classe ni d'un
    // index de tableau.
    expect(files.compareDocumentPosition(kpis) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Les KPI et le graphe sont CONSERVÉS — ils sont repositionnés, pas supprimés.
    expect(kpis).toBeInTheDocument();
    expect(screen.getByTestId('bloc-revenus')).toBeInTheDocument();
    expect(screen.getByTestId('bloc-activite')).toBeInTheDocument();
  });

  it('passe le compte d’impayés CALCULÉ PAR LE SERVEUR, sans requête de plus', async () => {
    mockFetchDashboard.mockResolvedValue(charge(12));
    render(withIntl(await Page()));

    expect(screen.getByTestId('bloc-files')).toHaveAttribute('data-overdue', '12');
    // Une seule lecture du tableau de bord, et rien d'autre pour ce compteur.
    expect(mockFetchDashboard).toHaveBeenCalledTimes(1);
  });

  it('transmet le `kind` de l’agence, lu et non supposé', async () => {
    mockResolveAgency.mockResolvedValue({ id: 7, kind: 'individual' });
    render(withIntl(await Page()));

    expect(screen.getByTestId('bloc-files')).toHaveAttribute('data-standard', 'false');
    expect(screen.getByTestId('bloc-files')).toHaveAttribute('data-agency', '7');
  });

  it('sur un `kind` illisible, transmet « inconnu » et non « individual »', async () => {
    mockResolveAgency.mockResolvedValue(null);
    render(withIntl(await Page()));

    expect(screen.getByTestId('bloc-files')).toHaveAttribute('data-standard', 'undefined');
  });

  it('MESURE — une agence `individual` n’atteint jamais cet écran (portée de l’AC3)', async () => {
    // `ensureStandardAgencyOrRedirect` est la garde réelle : elle `redirect('/app')`. On la
    // simule en levant, comme le fait `redirect()` de Next.
    mockEnsureStandard.mockRejectedValue(new Error('NEXT_REDIRECT'));

    await expect(Page()).rejects.toThrow('NEXT_REDIRECT');
    // Rien n'a été demandé : la page ne charge même pas le tableau de bord.
    expect(mockFetchDashboard).not.toHaveBeenCalled();
  });

  it('rend l’état dégradé quand la charge est absente, sans bloc de files', async () => {
    mockFetchDashboard.mockResolvedValue(null);
    render(withIntl(await Page()));

    expect(screen.queryByTestId('bloc-files')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bloc-kpis')).not.toBeInTheDocument();
  });
});
