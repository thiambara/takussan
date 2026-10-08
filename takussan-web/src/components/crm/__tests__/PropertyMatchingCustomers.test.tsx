/**
 * TCK-591 §5 — « N prospects correspondent » : le compte vient de l'API (`meta.total`), un prospect
 * illisible reste compté sans nom ni lien, et rien ne s'affiche sur un refus ou un compte nul.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { withIntl } from '@/test/intl';
import { PropertyMatchingCustomers } from '../PropertyMatchingCustomers';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }),
}));
const fetchMatchingCustomers = vi.fn();
vi.mock('@/lib/queries/agent-crm', async (original) => ({
  ...(await original<typeof import('@/lib/queries/agent-crm')>()),
  fetchMatchingCustomers: (...a: unknown[]) => fetchMatchingCustomers(...a),
}));

function rendu() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <PropertyMatchingCustomers propertyId={4} />
    </QueryClientProvider>,
  ));
}

describe('PropertyMatchingCustomers', () => {
  beforeEach(() => {
    fetchMatchingCustomers.mockReset();
  });

  it('annonce le total de l’API et liste les prospects, masqués compris', async () => {
    fetchMatchingCustomers.mockResolvedValue({
      data: [
        { id: 9, name: 'Awa Diop', pipeline_stage: 'qualified' },
        { id: null, name: null, pipeline_stage: null },
      ],
      meta: { current_page: 1, last_page: 2, per_page: 2, total: 4 },
    });
    rendu();

    const bouton = await screen.findByRole('button', { name: /4 prospects correspondent/ });
    await userEvent.click(bouton);
    expect(screen.getByRole('link', { name: 'Awa Diop' })).toHaveAttribute('href', '/app/customers/9');
    expect(screen.getByText('Un prospect suivi par un collègue')).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByText('et 2 autres')).toBeInTheDocument();
  });

  it('se tait sur un compte nul', async () => {
    fetchMatchingCustomers.mockResolvedValue({ data: [], meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 } });
    rendu();
    await waitFor(() => expect(fetchMatchingCustomers).toHaveBeenCalled());
    expect(screen.queryByTestId('property-matching-customers')).toBeNull();
  });

  it('se tait sur un refus', async () => {
    fetchMatchingCustomers.mockRejectedValue(new ApiError(403, { message: 'Forbidden' }));
    rendu();
    await waitFor(() => expect(fetchMatchingCustomers).toHaveBeenCalled());
    expect(screen.queryByTestId('property-matching-customers')).toBeNull();
  });
});
