import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { AdminFinancesClient } from '../AdminFinancesClient';

/**
 * TCK-370, défaut n°4 — le MAILLON DU MILIEU.
 *
 * `AdminFinancesTabs` acceptait `defaultCommissionRate` depuis TCK-134 et personne ne le lui
 * passait : `AdminFinancesClient`, le seul composant qui le monte, ne portait pas la prop du
 * tout. Une prop déclarée et jamais transmise ne casse rien, ne lève rien, et ne se voit qu'à
 * l'écran — un curseur qui démarre au mauvais endroit.
 *
 * La valeur d'épreuve est 7,5 : le défaut se manifestait comme un `?? 0`, donc une agence à 0 %
 * aurait rendu ce test vert avec ET sans le correctif.
 */

const propsTabs: Array<{ defaultCommissionRate?: number }> = [];

vi.mock('@/components/admin/finances/AdminFinancesTabs', () => ({
  AdminFinancesTabs: (props: { defaultCommissionRate?: number }) => {
    propsTabs.push(props);
    return <div data-testid="tabs" />;
  },
}));

vi.mock('@/components/admin/finances/FinanceKpis', () => ({
  FinanceKpis: () => <div />,
}));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'test-token' }) }));

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

describe('<AdminFinancesClient> — taux de commission', () => {
  it('fait suivre le taux de l’agence à AdminFinancesTabs', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      withIntl(
        <QueryClientProvider client={queryClient}>
          <AdminFinancesClient canViewFinances canEmitFinances defaultCommissionRate={7.5} />
        </QueryClientProvider>,
      ),
    );

    expect(propsTabs.at(-1)?.defaultCommissionRate).toBe(7.5);
  });
});
