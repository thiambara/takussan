/**
 * TCK-591, AC24 — une activité qui ne se charge pas se DIT, et se relance.
 *
 * Le tiroir appelait `/api/audit-log` (réservé aux administrateurs) et son `catch` rendait une
 * liste vide : l'agent lisait « aucune activité » sur une fiche qui en avait.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { withIntl } from '@/test/intl';
import { CustomerActivityFeed } from '../CustomerActivityFeed';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }),
}));

const fetchCustomerActivity = vi.fn();
vi.mock('@/lib/queries/agent-crm', async (original) => ({
  ...(await original<typeof import('@/lib/queries/agent-crm')>()),
  fetchCustomerActivity: (...args: unknown[]) => fetchCustomerActivity(...args),
}));

function rendu() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(
    <QueryClientProvider client={client}>
      <CustomerActivityFeed customerId={7} />
    </QueryClientProvider>,
  ));
}

const page = {
  data: [{
    id: 1,
    subject: 'customer',
    subject_id: 7,
    event: 'updated',
    causer: { id: 2, name: 'Awa Diop' },
    changes: { old: { pipeline_stage: 'lead' }, attributes: { pipeline_stage: 'prospect' } },
    created_at: '2026-10-01T10:00:00Z',
  }],
  meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
};

describe('CustomerActivityFeed', () => {
  beforeEach(() => fetchCustomerActivity.mockReset());

  it.each([403, 500])('un %i affiche une erreur relançable, jamais « aucune activité »', async (status) => {
    fetchCustomerActivity.mockRejectedValueOnce(new ApiError(status, { message: 'non' }));
    fetchCustomerActivity.mockResolvedValueOnce(page);
    rendu();

    const relancer = await screen.findByRole('button', { name: 'Réessayer' });
    expect(screen.queryByText("Aucune activité pour l'instant.")).not.toBeInTheDocument();

    await userEvent.setup().click(relancer);
    expect(await screen.findByText('Awa Diop a fait passer le client de « Lead » à « Prospect »')).toBeInTheDocument();
    expect(fetchCustomerActivity).toHaveBeenCalledWith('jeton', 7, 1);
  });

  it('un journal réellement vide le dit', async () => {
    fetchCustomerActivity.mockResolvedValueOnce({ ...page, data: [], meta: { ...page.meta, total: 0 } });
    rendu();

    expect(await screen.findByText("Aucune activité pour l'instant.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument();
  });
});
