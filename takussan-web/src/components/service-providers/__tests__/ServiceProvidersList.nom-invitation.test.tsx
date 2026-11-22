import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ServiceProvidersList } from '../ServiceProvidersList';

/**
 * P220.06 (TCK-2136) — un prestataire lié à un compte sans nom (créé par téléphone) garde le nom
 * que l'agence a saisi à l'invitation (`metadata`).
 */
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: vi.fn(async () => donnees),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, token: 'jeton', isLoading: false }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

const donnees = {
  data: [{
    id: 3, user_id: 103, agency_id: 7, status: 'active', created_at: null,
    specialties: ['plumbing'], service_areas: ['Dakar'], insured: false,
    metadata: { first_name: 'Ibrahima', last_name: 'Fall' },
    user: { id: 103, first_name: '', last_name: '', email: null },
  }],
  meta: { total: 1, current_page: 1, last_page: 1, per_page: 20 },
  links: { first: null, last: null, prev: null, next: null },
} as never;

// TCK-2653 — la liste se rend aussi en cartes au téléphone (`carteMobile`) : les requêtes visent la table.
describe('<ServiceProvidersList> — nom saisi à l’invitation', () => {
  it('un compte lié sans nom retombe sur le nom de l’invitation', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(withIntl(
      <QueryClientProvider client={client}>
        <ServiceProvidersList agencyId={7} canInvite initialData={donnees} />
      </QueryClientProvider>,
    ));

    expect(await within(await screen.findByRole('table')).findByText('Ibrahima Fall')).toBeInTheDocument();
  });
});
