import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { OwnersList } from '../OwnersList';
import type { OwnerProfileSummary } from '@/lib/queries/owners';

/**
 * TCK-1323 (P117.05) — la raison sociale d'un bailleur société, exigée à l'invitation et rangée en
 * `metadata.company_name`, nomme sa ligne du carnet ; le contact reste lisible en dessous.
 */
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: vi.fn(async () => donnees),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, token: 'jeton', isLoading: false }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

const base = {
  agency_id: 7, status: 'active', created_at: null,
  rib_masked: null, tax_id_masked: null, id_document_number_masked: null,
} as const;

const donnees = {
  data: [
    {
      ...base, id: 3, user_id: 9,
      metadata: { owner_type: 'company', company_name: 'SCI Teranga' },
      user: { id: 9, first_name: 'Fatou', last_name: 'Sarr', email: 'f@example.test' },
    },
    {
      ...base, id: 4, user_id: 10,
      metadata: { owner_type: 'individual' },
      user: { id: 10, first_name: 'Ousmane', last_name: 'Ba', email: 'o@example.test' },
    },
  ] satisfies OwnerProfileSummary[],
  meta: { total: 2, current_page: 1, last_page: 1, per_page: 20 },
  links: { first: null, last: null, prev: null, next: null },
} as never;

describe('<OwnersList> — raison sociale', () => {
  it('une société est nommée par sa raison sociale, son contact en dessous ; un particulier, par son nom', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(withIntl(
      <QueryClientProvider client={client}>
        <OwnersList agencyId={7} canInvite initialData={donnees} />
      </QueryClientProvider>,
    ));

    const raison = await screen.findByText('SCI Teranga');
    const cellule = within(raison.closest('td') as HTMLElement);
    expect(cellule.getByText('Fatou Sarr')).toBeInTheDocument();
    expect(screen.getByText('Ousmane Ba')).toBeInTheDocument();
  });
});
