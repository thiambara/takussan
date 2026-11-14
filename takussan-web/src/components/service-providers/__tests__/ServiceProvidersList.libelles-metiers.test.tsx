import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ServiceProvidersList } from '../ServiceProvidersList';

/**
 * TCK-2713 — la colonne « Métiers » du carnet libelle les métiers que l'onboarding du prestataire
 * écrit (`masonry`, `climate_control`, `cleaning`, `pest_control`) : sans leur clé dans
 * `serviceProviders.invite.trades`, elle affichait le chemin de la clé.
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
    specialties: ['masonry', 'climate_control', 'cleaning', 'pest_control'],
    service_areas: ['Dakar'], metadata: null, insured: false,
    user: { id: 103, first_name: 'Fatou', last_name: 'Sarr', email: 'fatou@example.test' },
  }],
  meta: { total: 1, current_page: 1, last_page: 1, per_page: 20 },
  links: { first: null, last: null, prev: null, next: null },
} as never;

const LIBELLES = {
  fr: ['Maçonnerie', 'Climatisation', 'Nettoyage', 'Désinsectisation'],
  en: ['Masonry', 'Climate control', 'Cleaning', 'Pest control'],
} as const;

// TCK-2653 — la liste se rend aussi en cartes au téléphone (`carteMobile`) : les requêtes visent la table.
describe('<ServiceProvidersList> — libellés des métiers (TCK-2713)', () => {
  for (const locale of ['fr', 'en'] as const) {
    it(`libelle les quatre métiers en ${locale}, sans code brut`, async () => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(withIntl(
        <QueryClientProvider client={client}>
          <ServiceProvidersList agencyId={7} canInvite initialData={donnees} />
        </QueryClientProvider>,
        locale,
      ));

      const ligne = (await within(await screen.findByRole('table')).findByText('Fatou Sarr')).closest('tr') as HTMLElement;
      for (const libelle of LIBELLES[locale]) {
        expect(within(ligne).getByText(libelle)).toBeInTheDocument();
      }
      expect(within(ligne).queryByText(/masonry|climate_control|pest_control|invite\.trades/)).not.toBeInTheDocument();
    });
  }
});
