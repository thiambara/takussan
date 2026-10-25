import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { OwnersList } from '../OwnersList';
import type { OwnerProfileSummary } from '@/lib/queries/owners';

/**
 * P220.06 (TCK-2136) — un bailleur lié à un compte sans nom (créé par téléphone) garde le nom que
 * l'agence a saisi à l'invitation (`metadata`), au lieu d'une ligne de tirets.
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
      metadata: { owner_type: 'individual', first_name: 'Moussa', last_name: 'Ndiaye' },
      user: { id: 9, first_name: '', last_name: '', email: null },
    },
    {
      ...base, id: 4, user_id: 10,
      metadata: { owner_type: 'individual', first_name: 'Ancien', last_name: 'Nom' },
      user: { id: 10, first_name: 'Ousmane', last_name: 'Ba', email: 'o@example.test' },
    },
  ] as unknown as OwnerProfileSummary[],
  meta: { total: 2, current_page: 1, last_page: 1, per_page: 20 },
  links: { first: null, last: null, prev: null, next: null },
} as never;

describe('<OwnersList> — nom saisi à l’invitation', () => {
  it('un compte lié sans nom retombe sur le nom de l’invitation ; un compte nommé garde le sien', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(withIntl(
      <QueryClientProvider client={client}>
        <OwnersList agencyId={7} canInvite initialData={donnees} />
      </QueryClientProvider>,
    ));

    expect(await screen.findByText('Moussa Ndiaye')).toBeInTheDocument();
    expect(screen.getByText('Ousmane Ba')).toBeInTheDocument();
    expect(screen.queryByText('Ancien Nom')).not.toBeInTheDocument();
  });
});
