import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import { withIntl } from '@/test/intl';

/**
 * TCK-647 (ADR-0064 §3) — `/app/overview/agency` est LE tableau de bord d'agence : il a absorbé
 * celui de `/admin`.
 *
 * La page est EXÉCUTÉE, et ses blocs sont les VRAIS composants : AC2 (« aucun chiffre deux fois »)
 * est une propriété du texte rendu par la page ENTIÈRE, qu'aucun test de composant ne peut voir —
 * les deux doublons qu'il a fait sortir vivaient chacun entre deux blocs, ou entre une tuile et son
 * indice. Seuls sont remplacés : la carte « Mise en service » (elle lit l'API par React Query,
 * éprouvée dans `MiseEnService.test.tsx`) et les deux graphiques, réduits à ce qu'on leur passe.
 *
 * AC3 (« une seule lecture ») se compte au point le plus bas : `apiRequest`. Compter les appels
 * d'UNE fonction de lecture aurait été vert avec une page qui en appelle deux différentes — c'était
 * exactement l'état d'avant, `fetchDashboardAgency` sous `/admin` et `fetchAgencyDashboard` ici.
 */

const { getMe, resolveAgency, apiRequest } = vi.hoisted(() => ({
  getMe: vi.fn(),
  resolveAgency: vi.fn(),
  apiRequest: vi.fn(),
}));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => getMe() }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/access/server-guards', () => ({
  resolveAgencyOrNull: (...a: unknown[]) => resolveAgency(...a),
}));
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiRequest: (...a: unknown[]) => apiRequest(...a) };
});
vi.mock('@/lib/queries/kyc', () => ({
  fetchAgencyKyc: async () => ({ data: { status: 'verified' } }),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, token: null }) }));
vi.mock('@/components/dashboard/admin/MiseEnService', () => ({
  MiseEnService: ({ agencyId }: { agencyId: number | null }) => (
    <div data-testid="bloc-mise-en-service" data-agency={String(agencyId)} />
  ),
}));
vi.mock('@/components/charts/BarChart', () => ({
  BarChart: ({ data }: { data: { series: { name: string }[] } }) => (
    <div data-testid="graphe" data-series={data.series.map((s) => s.name).join('|')} />
  ),
}));
vi.mock('@/components/charts/LineChart', () => ({
  LineChart: ({ data }: { data: { series: { name: string }[] } }) => (
    <div data-testid="graphe" data-series={data.series.map((s) => s.name).join('|')} />
  ),
}));

const { default: Page } = await import('../page');

/**
 * Des valeurs DISTINCTES deux à deux, et dont aucune ne se lit dans une autre ni dans les dates de
 * la période (« 1 août 2026 », « 30 août 2026 ») : un compte d'occurrences n'a de sens que si une
 * valeur ne peut pas être trouvée par hasard ailleurs.
 */
const RESUME = {
  agency_id: 7,
  period: { start: '2026-08-01', end: '2026-08-30' },
  properties: { total: 41, published: 37, rented: 29, available: 12 },
  leases: { active: 43 },
  customers_count: 53,
  members_count: 19,
  bookings: { pending: 83 },
  maintenance: { open: 65 },
  finance: {
    revenue_month: 1_234_567,
    commission_month: 123_457,
    overdue_count: 11,
    overdue_amount: 456_789,
    unpaid_rate_percent: 4.5,
  },
  occupancy: { rate_percent: 71 },
};

const CHARGE = {
  data: RESUME,
  timeseries: { months: ['2026-07', '2026-08'], revenue: [900_000, 1_234_567], occupancy: [68, 71] },
};

const ADMIN_STANDARD = { id: 1, roles: ['agency_admin'], agency_id: 7 };

function appelsDuTableauDeBord(): unknown[][] {
  return apiRequest.mock.calls.filter(
    ([chemin]) => typeof chemin === 'string' && chemin.startsWith('/api/dashboard/agency'),
  );
}

async function rendre(searchParams: Record<string, string> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const page = (await Page({ searchParams: Promise.resolve(searchParams) })) as ReactNode;
  return render(withIntl(<QueryClientProvider client={client}>{page}</QueryClientProvider>));
}

/** Les occurrences d'une valeur formatée, sans chiffre collé à gauche ni à droite. */
function occurrences(texte: string, valeur: string): number {
  const motif = valeur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return texte.match(new RegExp(`(?<!\\d)${motif}(?!\\d)`, 'g'))?.length ?? 0;
}

function suit(avant: HTMLElement, apres: HTMLElement): boolean {
  return Boolean(avant.compareDocumentPosition(apres) & Node.DOCUMENT_POSITION_FOLLOWING);
}

beforeEach(() => {
  vi.clearAllMocks();
  getMe.mockResolvedValue(ADMIN_STANDARD);
  resolveAgency.mockResolvedValue({ id: 7, kind: 'standard' });
  apiRequest.mockImplementation(async (chemin: string) => {
    if (chemin.startsWith('/api/dashboard/agency')) return CHARGE;
    throw new Error(`appel inattendu : ${chemin}`);
  });
});

describe('/app/overview/agency — le tableau de bord unique (TCK-647)', () => {
  it('AC1 — mise en service, files, indicateurs, activité, revenus et occupation, dans cet ordre', async () => {
    await rendre();

    const miseEnService = screen.getByTestId('bloc-mise-en-service');
    const files = screen.getByRole('heading', { name: 'À traiter' });
    const indicateurs = screen.getByText("Taux d'impayés");
    const activite = screen.getByRole('heading', { name: 'Activité récente' });
    const revenus = screen.getByRole('heading', { name: 'Revenus — 12 derniers mois' });
    const occupation = screen.getByRole('heading', { name: 'Occupation — 12 derniers mois' });

    expect(miseEnService).toHaveAttribute('data-agency', '7');
    // Ce qui demande un geste passe avant ce qui décrit un état (TCK-375, repris de `/admin`).
    expect(suit(miseEnService, files)).toBe(true);
    expect(suit(files, indicateurs)).toBe(true);
    expect(suit(indicateurs, activite)).toBe(true);
    expect(suit(activite, revenus)).toBe(true);
    expect(suit(revenus, occupation)).toBe(true);
  });

  it('AC2 — aucun chiffre n’y figure deux fois', async () => {
    const { container } = await rendre();
    // Nœud texte par nœud texte : `textContent` colle « Biens », « 41 » et « 37 publiés » en
    // « Biens4137 publiés », où aucun des deux nombres ne se lit plus.
    const marcheur = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const morceaux: string[] = [];
    while (marcheur.nextNode()) morceaux.push(marcheur.currentNode.textContent ?? '');
    const texte = morceaux.join('\n');

    const chiffres: Record<string, string> = {
      'properties.total': formatNumber(RESUME.properties.total, 'fr'),
      'properties.published': formatNumber(RESUME.properties.published, 'fr'),
      'properties.rented': formatNumber(RESUME.properties.rented, 'fr'),
      'leases.active': formatNumber(RESUME.leases.active, 'fr'),
      customers_count: formatNumber(RESUME.customers_count, 'fr'),
      members_count: formatNumber(RESUME.members_count, 'fr'),
      'bookings.pending': formatNumber(RESUME.bookings.pending, 'fr'),
      'maintenance.open': formatNumber(RESUME.maintenance.open, 'fr'),
      'finance.revenue_month': formatCurrency(RESUME.finance.revenue_month, 'fr'),
      'finance.commission_month': formatCurrency(RESUME.finance.commission_month, 'fr'),
      'finance.overdue_count': formatNumber(RESUME.finance.overdue_count, 'fr'),
      'finance.overdue_amount': formatCurrency(RESUME.finance.overdue_amount, 'fr'),
      'finance.unpaid_rate_percent': formatPercent(RESUME.finance.unpaid_rate_percent / 100, 'fr'),
      'occupancy.rate_percent': formatPercent(RESUME.occupancy.rate_percent / 100, 'fr'),
    };

    const comptes = Object.fromEntries(
      Object.entries(chiffres).map(([champ, valeur]) => [champ, occurrences(texte, valeur)]),
    );
    // Chaque chiffre de la charge est montré, et une seule fois.
    expect(comptes).toEqual(Object.fromEntries(Object.keys(chiffres).map((champ) => [champ, 1])));

    // Les séries temporelles : chacune dans UN graphique. Avant la fusion, les revenus étaient
    // tracés deux fois (barres de `/admin`, courbe de `/app/overview/agency`).
    const series = screen.getAllByTestId('graphe').map((g) => g.getAttribute('data-series'));
    expect(series.filter((s) => s?.includes('Revenus'))).toHaveLength(1);
    expect(series.filter((s) => s?.includes("Taux d'occupation"))).toHaveLength(1);
  });

  it('AC3 — un affichage lit `GET /api/dashboard/agency` UNE fois, séries temporelles comprises', async () => {
    await rendre();

    const appels = appelsDuTableauDeBord();
    expect(appels).toHaveLength(1);
    expect(appels[0]![0]).toContain('include=timeseries');
  });

  it('le kind de l’agence est LU et transmis aux files — « inconnu » n’est pas « individual »', async () => {
    // Le layout ne laisse passer que `standard` ; ce test garde le câblage, pas un cas atteignable.
    resolveAgency.mockResolvedValue({ id: 7, kind: 'individual' });
    const { unmount } = await rendre();
    expect(screen.queryByTestId('queue-row-moderation')).toBeNull();
    unmount();

    resolveAgency.mockResolvedValue(null);
    await rendre();
    expect(screen.getByTestId('queue-row-moderation')).toBeInTheDocument();
  });

  it('un super-admin sans agence voit « aucune agence », et rien n’est lu', async () => {
    getMe.mockResolvedValue({ id: 2, roles: ['super_admin'], agency_id: null });
    await rendre();

    expect(screen.getByText('Aucune agence rattachée à votre compte')).toBeInTheDocument();
    expect(appelsDuTableauDeBord()).toHaveLength(0);
    expect(screen.queryByTestId('bloc-mise-en-service')).toBeNull();
  });

  it('charge refusée (403/404) : l’état dégradé, sans files ni indicateurs', async () => {
    const { ApiError } = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    apiRequest.mockRejectedValue(new ApiError(403, null));
    await rendre();

    expect(screen.getByText('Indicateurs masqués')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'À traiter' })).toBeNull();
    expect(screen.queryByText("Taux d'impayés")).toBeNull();
    // La mise en service ne dépend pas de la charge : elle reste.
    expect(screen.getByTestId('bloc-mise-en-service')).toBeInTheDocument();
  });

  it('le motif d’une redirection est expliqué à l’arrivée ; un motif inconnu ne peint rien', async () => {
    const { unmount } = await rendre({ notice: 'tags-platform-managed' });
    expect(screen.getByRole('status')).toHaveTextContent('Les tags sont gérés par la plateforme');
    unmount();

    await rendre({ notice: 'nimporte-quoi' });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
