/**
 * TCK-591 §4 — visites, réservations et baux sur la fiche : chaque liste est filtrée CÔTÉ SERVEUR
 * sur le client (sparse fieldsets), et son statut s'affiche par un libellé traduit.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { CustomerLinkedRecords } from '../CustomerLinkedRecords';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }),
}));

const apiRequest = vi.fn();
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

function rendu(kind: 'visits' | 'leases') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <CustomerLinkedRecords customerId={4} kind={kind} />
    </QueryClientProvider>,
  ));
}

describe('CustomerLinkedRecords', () => {
  beforeEach(() => apiRequest.mockReset());

  it('liste les visites du client, filtrées par le serveur', async () => {
    apiRequest.mockResolvedValueOnce({
      data: [{ id: 8, status: 'confirmed', scheduled_at: '2026-10-10T10:00:00Z', property: { id: 2, title: 'F3 Mermoz' } }],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
    });
    rendu('visits');

    expect(await screen.findByRole('link', { name: 'F3 Mermoz' })).toHaveAttribute('href', '/app/visits/8');
    expect(screen.getByText(/Confirmée/)).toBeInTheDocument();
    const url = decodeURIComponent(String(apiRequest.mock.calls[0][0]));
    expect(url).toContain('/api/property-visits?');
    expect(url).toContain('filter[customer_id]=4');
    expect(url).toContain('fields[properties]=id,title');
  });

  it('cherche les baux où le client est locataire', async () => {
    apiRequest.mockResolvedValueOnce({ data: [], meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 } });
    rendu('leases');

    expect(await screen.findByText('Aucun bail pour ce client.')).toBeInTheDocument();
    expect(decodeURIComponent(String(apiRequest.mock.calls[0][0]))).toContain('filter[tenant_id]=4');
  });
});
