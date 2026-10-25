import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ServiceProvidersList } from '../ServiceProvidersList';

/**
 * P234.04 (TCK-2280) — le numéro que l'agence saisit à l'invitation (`metadata.phone`) est rendu
 * par le carnet des prestataires, `—` sans numéro.
 */
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: vi.fn(async () => donnees),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, token: 'jeton', isLoading: false }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

const ligne = {
  user_id: null, agency_id: 7, status: 'draft', created_at: null,
  specialties: ['plumbing'], service_areas: ['Dakar'], insured: false,
} as const;

const donnees = {
  data: [
    { ...ligne, id: 3, metadata: { first_name: 'Ibrahima', last_name: 'Fall', phone: '+221771234567' } },
    { ...ligne, id: 4, metadata: { first_name: 'Awa', last_name: 'Diop' } },
  ],
  meta: { total: 2, current_page: 1, last_page: 1, per_page: 20 },
  links: { first: null, last: null, prev: null, next: null },
} as never;

describe('<ServiceProvidersList> — numéro saisi à l’invitation', () => {
  it('rend le numéro de la fiche dans la colonne Téléphone, et un tiret sans numéro', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(withIntl(
      <QueryClientProvider client={client}>
        <ServiceProvidersList agencyId={7} canInvite initialData={donnees} />
      </QueryClientProvider>,
    ));

    await screen.findByText('Ibrahima Fall');
    const entetes = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim());
    const colonne = entetes.indexOf('Téléphone');
    expect(colonne).toBeGreaterThan(-1);
    const [, premiere, seconde] = screen.getAllByRole('row');
    expect(within(premiere).getAllByRole('cell')[colonne]).toHaveTextContent('+221 77 123 45 67');
    expect(within(seconde).getAllByRole('cell')[colonne]).toHaveTextContent('—');
  });
});
