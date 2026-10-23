import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withIntl } from '@/test/intl';

/**
 * TCK-1436 (P162.04) — le lanceur d'une demande liste les baux où l'API accepte la demande :
 * `active` ET `terminating` (TCK-1001). Un locataire en préavis tombait sur « contactez l'agence ».
 * TCK-1745 — la lecture passe par `useAllOngoingLeases` : l'API est bouchonnée par `fetch`.
 */
vi.mock('../MaintenanceForm', () => ({
  MaintenanceForm: ({ propertyId, leaseId }: { propertyId: number; leaseId: number }) => (
    <div data-testid="form">{`${propertyId}/${leaseId}`}</div>
  ),
}));

import { MaintenanceNewLauncher } from '../MaintenanceNewLauncher';

describe('MaintenanceNewLauncher', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('demande les baux actifs et en préavis, et propose le bail en préavis', async () => {
    const statuts: (string | null)[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        statuts.push(new URL(String(url), 'http://api.test').searchParams.get('filter[status]'));
        return new Response(
          JSON.stringify({
            data: [{ id: 5, status: 'terminating', property: { id: 44, title: 'Villa Ngor' } }],
            meta: { current_page: 1, last_page: 1, per_page: 100, total: 1 },
          }),
          { status: 200 },
        );
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(withIntl(<QueryClientProvider client={client}><MaintenanceNewLauncher /></QueryClientProvider>));

    expect((await screen.findByTestId('form')).textContent).toBe('44/5');
    expect(statuts).toEqual(['active,terminating']);
  });
});
