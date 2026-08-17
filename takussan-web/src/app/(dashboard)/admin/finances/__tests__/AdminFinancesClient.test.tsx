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
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({
    data: { data: [], meta: { active_profile_id: null, count: 0 } },
    isLoading: false,
  }),
}));

// `AdminFinancesTabs` mounts the full payments UI tree (Base UI fields,
// dialogs, locale-aware tables). The permission gate test only cares that
// the tabs render *at all* when allowed — stub them with a marker.
vi.mock('@/components/admin/finances/AdminFinancesTabs', () => ({
  AdminFinancesTabs: ({ canEmit }: { canEmit?: boolean }) => (
    <div data-testid="admin-finances-tabs-stub">
      <button type="button" role="tab" name="Encaissements">Encaissements</button>
      <button type="button" role="tab" name="Impayés">Impayés</button>
      {canEmit ? (
        <>
          <button type="button">Générer une facture</button>
          <button type="button">Créer un reversement</button>
        </>
      ) : null}
    </div>
  ),
}));

vi.mock('@/components/admin/finances/FinanceKpis', () => ({
  FinanceKpis: () => <div data-testid="finance-kpis" />,
}));

// The tabs/components mount tables that fire requests on mount — silence
// them with a permissive fetch stub for the perm-allowed render path.
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

  it('renders KPI strip + tabs when the actor can view finances', () => {
    stubFetch();
    renderWith(
      <AdminFinancesClient canViewFinances canEmitFinances />,
    );
    expect(screen.getByTestId('finance-kpis')).toBeInTheDocument();
    expect(screen.getByTestId('admin-finances-tabs-stub')).toBeInTheDocument();
    expect(screen.getByText('Encaissements')).toBeInTheDocument();
    expect(screen.getByText('Impayés')).toBeInTheDocument();
  });

  it('hides the action buttons when canEmitFinances is false', () => {
    stubFetch();
    renderWith(
      <AdminFinancesClient canViewFinances canEmitFinances={false} />,
    );
    expect(screen.queryByText(/Générer une facture/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Créer un reversement/i)).not.toBeInTheDocument();
  });
});
