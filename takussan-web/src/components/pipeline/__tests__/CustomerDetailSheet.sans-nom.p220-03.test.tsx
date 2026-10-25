import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { CustomerDetailSheet } from '../CustomerDetailSheet';

/**
 * P220.03 (TCK-2281) — une fiche client née d'un compte créé par téléphone garde prénom et nom
 * vides. Décision du porteur : chaque écran la nomme par `nomAffichable()` (e-mail, numéro, `#<id>`),
 * avec les seuls champs qu'il charge déjà ; avant, il composait une chaîne vide.
 */
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/lib/queries/pipeline', async (original) => ({
  ...(await original<typeof import('@/lib/queries/pipeline')>()),
  fetchCustomerTasks: async () => [],
}));
vi.mock('@/lib/queries/customers', async (original) => ({
  ...(await original<typeof import('@/lib/queries/customers')>()),
  fetchCustomerNotes: async () => [],
  fetchDashboardCustomer: async () => ({
    id: 9,
    first_name: '',
    last_name: '',
    email: 'awa@example.sn',
    phone: '+221770000622',
    status: 'active',
    pipeline_stage: 'lead',
    occupation: null,
    created_at: '2026-10-20T10:00:00Z',
  }),
}));

describe('CustomerDetailSheet — fiche sans nom (P220.03)', () => {
  it('l’en-tête et les gestes de contact la nomment par son e-mail', async () => {
    render(withIntl(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CustomerDetailSheet customerId={9} onOpenChange={() => {}} />
      </QueryClientProvider>,
    ));

    expect(await screen.findByRole('link', { name: 'Appeler awa@example.sn' })).toBeInTheDocument();
    expect(screen.getAllByText('awa@example.sn').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId('customer-detail-sheet').querySelector('header p')).toHaveTextContent('awa@example.sn');
  });
});
