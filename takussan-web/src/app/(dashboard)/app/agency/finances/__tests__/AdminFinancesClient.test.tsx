import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// `withIntl` charge le VRAI `fr.json` : depuis TCK-292 le message d'accès refusé vient du
// dictionnaire, et un rendu sans provider LÈVE. Les assertions françaises sont inchangées.
import { withIntl } from '@/test/intl';
import { AdminFinancesClient } from '../AdminFinancesClient';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

// Le mock complet de `next-intl` a été RETIRÉ (TCK-292) : il ne fournissait que `useLocale`, et
// `withIntl` a besoin du vrai `NextIntlClientProvider`. Le provider réel rend `useLocale` ET
// `useTranslations` corrects — un mock partiel d'un module qu'on utilise vraiment est une dette
// qui se paie au premier composant traduit.

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/app/agency/finances',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

// Toutes les capacités : ce fichier garde la porte de la page ; l'accord geste/capacité est gardé par
// `components/admin/finances/__tests__/AdminFinancesTabs.capacites.test.tsx`.
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: true, isLoading: false }) }));

// TCK-2659 — le point du mois et les registres montent leurs propres lectures (synthèse, historique,
// tables) : des marqueurs suffisent à dire que la page les rend.
vi.mock('@/components/admin/finances/argent/PointDuMois', () => ({
  TuilesDuMois: () => <div data-testid="tuiles-du-mois" />,
  AFaireEtDerniers: () => <div data-testid="a-faire" />,
  PointDuMoisTelephone: () => <div data-testid="point-telephone" />,
  lienDOnglet: () => '/app/agency/finances',
}));
vi.mock('@/components/admin/finances/argent/EncaissementsAgence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/admin/finances/argent/EncaissementsAgence')>()),
  EncaissementsAgence: () => null,
}));
vi.mock('@/components/payments/InvoicesTable', () => ({ InvoicesTable: () => null }));
vi.mock('@/components/payments/PayoutsTable', () => ({ PayoutsTable: () => null }));
vi.mock('@/components/payments/CreateInvoiceDialog', () => ({ CreateInvoiceDialog: () => null }));
vi.mock('@/components/payments/CreatePayoutDialog', () => ({ CreatePayoutDialog: () => null }));
vi.mock('@/components/payments/InvoiceDetailDialog', () => ({ InvoiceDetailDialog: () => null }));
vi.mock('@/components/payments/PayoutDetailDialog', () => ({ PayoutDetailDialog: () => null }));
vi.mock('@/components/admin/finances/OverduePaymentsTable', () => ({ OverduePaymentsTable: () => null }));

// La synthèse du mois part par `fetch` : une réponse vide suffit.
function stubFetch() {
  const fakeResponse = {
    ok: true,
    status: 200,
    json: async () => ({
      data: [],
      meta: { current_page: 1, last_page: 0, per_page: 20, total: 0 },
    }),
    text: async () => '{}',
  };
  vi.stubGlobal('fetch', vi.fn(async () => fakeResponse));
}

function renderWith(node: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    withIntl(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>),
  );
}

describe('TCK-134 — AdminFinancesClient permission gate', () => {
  it('renders the degraded state when the actor cannot view finances', () => {
    renderWith(
      <AdminFinancesClient canViewFinances={false} canEmitFinances={false} />,
    );
    expect(screen.getByTestId('finances-degraded')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/Accès aux finances non autorisé/);
  });

  it('renders the month point (tiles, « À faire ») and the register tabs when the actor can view finances', () => {
    stubFetch();
    renderWith(
      <AdminFinancesClient canViewFinances canEmitFinances agencyId={1} />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Argent' })).toBeInTheDocument();
    expect(screen.getByTestId('tuiles-du-mois')).toBeInTheDocument();
    expect(screen.getByTestId('a-faire')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Encaissements' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Impayés/ })).toBeInTheDocument();
  });

  it('hides the action buttons when canEmitFinances is false', () => {
    stubFetch();
    renderWith(
      <AdminFinancesClient canViewFinances canEmitFinances={false} agencyId={1} />,
    );
    expect(screen.queryByText(/Générer une facture/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Créer un reversement/i)).not.toBeInTheDocument();
  });

  it('shows the reconciliation link only when the page opens it (TCK-2260, moved here by TCK-2659)', () => {
    stubFetch();
    const { unmount } = renderWith(<AdminFinancesClient canViewFinances canEmitFinances rapprochement agencyId={1} />);
    expect(screen.getByRole('link', { name: /Rapprochement bancaire/ })).toHaveAttribute('href', '/app/agency/finances/reconciliation');
    unmount();

    renderWith(<AdminFinancesClient canViewFinances canEmitFinances agencyId={1} />);
    expect(screen.queryByRole('link', { name: /Rapprochement bancaire/ })).not.toBeInTheDocument();
  });
});
