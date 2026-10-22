import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ServiceProvidersList } from '../ServiceProvidersList';

/**
 * TCK-1319 (P117.01) — la colonne fait foi dès qu'elle a été écrite. Un prestataire actif qui vide
 * ses métiers et ses zones (`PATCH …/trades`, colonnes à `null`) ne doit pas reprendre la copie que
 * l'invitation a laissée dans `metadata` ; seul un brouillon y retombe.
 */
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: vi.fn(async () => donnees),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, token: 'jeton', isLoading: false }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

const copie = { trades: ['plumbing'], intervention_zones: ['Dakar'] };

const donnees = {
  data: [
    {
      id: 3, user_id: 9, agency_id: 7, status: 'active', created_at: null,
      specialties: null, service_areas: null, metadata: copie,
      user: { id: 9, first_name: 'Fatou', last_name: 'Sarr', email: 'f@example.test' },
    },
    {
      id: 4, user_id: null, agency_id: 7, status: 'draft', created_at: null,
      specialties: null, service_areas: null, metadata: { ...copie, first_name: 'Ousmane', last_name: 'Ba' },
    },
  ],
  meta: { total: 2, current_page: 1, last_page: 1, per_page: 20 },
  links: { first: null, last: null, prev: null, next: null },
} as never;

function ligneDe(nom: string): HTMLElement {
  const row = screen.getByText(nom).closest('tr');
  if (!row) throw new Error(`ligne introuvable : ${nom}`);
  return row as HTMLElement;
}

describe('<ServiceProvidersList> — copie de l’invitation en metadata', () => {
  it('un prestataire actif aux colonnes vides n’affiche ni métier ni zone de la copie', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(withIntl(
      <QueryClientProvider client={client}>
        <ServiceProvidersList agencyId={7} canInvite initialData={donnees} />
      </QueryClientProvider>,
    ));

    await screen.findByText('Fatou Sarr');
    const actif = within(ligneDe('Fatou Sarr'));
    expect(actif.queryByText('Plomberie')).not.toBeInTheDocument();
    expect(actif.queryByText('Dakar')).not.toBeInTheDocument();

    const brouillon = within(ligneDe('Ousmane Ba'));
    expect(brouillon.getByText('Plomberie')).toBeInTheDocument();
    expect(brouillon.getByText('Dakar')).toBeInTheDocument();
  });
});
