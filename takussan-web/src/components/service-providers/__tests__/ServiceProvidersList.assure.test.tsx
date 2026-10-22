import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ServiceProvidersList } from '../ServiceProvidersList';

/**
 * TCK-1325 (P117.06) — le carnet porte un badge « Assuré » pour le prestataire dont l'API dit
 * `insured: true` (pièce d'assurance vivante), et aucun pour les autres.
 */
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: vi.fn(async () => donnees),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, token: 'jeton', isLoading: false }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

const ligne = (id: number, prenom: string, insured: boolean) => ({
  id, user_id: id + 100, agency_id: 7, status: 'active', created_at: null,
  specialties: ['plumbing'], service_areas: ['Dakar'], metadata: null, insured,
  user: { id: id + 100, first_name: prenom, last_name: 'Sarr', email: `${prenom}@example.test` },
});

const donnees = {
  data: [ligne(3, 'Fatou', true), ligne(4, 'Awa', false)],
  meta: { total: 2, current_page: 1, last_page: 1, per_page: 20 },
  links: { first: null, last: null, prev: null, next: null },
} as never;

describe('<ServiceProvidersList> — badge « Assuré »', () => {
  it('ne marque que le prestataire assuré', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(withIntl(
      <QueryClientProvider client={client}>
        <ServiceProvidersList agencyId={7} canInvite initialData={donnees} />
      </QueryClientProvider>,
    ));

    const assure = (await screen.findByText('Fatou Sarr')).closest('tr') as HTMLElement;
    const nonAssure = screen.getByText('Awa Sarr').closest('tr') as HTMLElement;
    expect(within(assure).getByText('Assuré')).toBeInTheDocument();
    expect(within(nonAssure).queryByText('Assuré')).not.toBeInTheDocument();
  });
});
