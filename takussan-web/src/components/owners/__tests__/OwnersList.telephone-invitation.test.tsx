import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { OwnersList } from '../OwnersList';
import type { OwnerProfileSummary } from '@/lib/queries/owners';

/**
 * P234.04 (TCK-2280) — le numéro que l'agence saisit à l'invitation est une donnée de sa fiche
 * (`metadata.phone`), jamais celui du compte : le carnet le rend dans sa colonne, `—` sans numéro.
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
      metadata: { owner_type: 'individual', first_name: 'Moussa', last_name: 'Ndiaye', phone: '+221771234567' },
      user: { id: 9, first_name: 'Moussa', last_name: 'Ndiaye', email: 'm@example.test' },
    },
    {
      ...base, id: 4, user_id: 10,
      metadata: { owner_type: 'individual', first_name: 'Ousmane', last_name: 'Ba' },
      user: { id: 10, first_name: 'Ousmane', last_name: 'Ba', email: 'o@example.test' },
    },
  ] as unknown as OwnerProfileSummary[],
  meta: { total: 2, current_page: 1, last_page: 1, per_page: 20 },
  links: { first: null, last: null, prev: null, next: null },
} as never;

describe('<OwnersList> — numéro saisi à l’invitation', () => {
  it('rend le numéro de la fiche dans la colonne Téléphone, et un tiret sans numéro', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(withIntl(
      <QueryClientProvider client={client}>
        <OwnersList agencyId={7} canInvite initialData={donnees} />
      </QueryClientProvider>,
    ));

    await screen.findByText('Moussa Ndiaye');
    const entetes = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim());
    const colonne = entetes.indexOf('Téléphone');
    expect(colonne).toBeGreaterThan(-1);
    const [, premiere, seconde] = screen.getAllByRole('row');
    expect(within(premiere).getAllByRole('cell')[colonne]).toHaveTextContent('+221 77 123 45 67');
    expect(within(seconde).getAllByRole('cell')[colonne]).toHaveTextContent('—');
  });
});
