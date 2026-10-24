import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { navigationDeTest } from '@/test/navigation-url';
import { InventoryList } from '../InventoryList';
import type { InventoryListParams } from '@/lib/queries/inventory';
import type { Inventory } from '@/types/inventory';

const appels = vi.hoisted(() => ({ params: [] as unknown[] }));

function ligne(id: number): Inventory {
  return {
    id,
    lease_id: id,
    property_id: id,
    type: 'move_in',
    status: 'draft',
    conducted_at: null,
    rooms: [],
    created_at: '2026-08-01T10:00:00Z',
    updated_at: '2026-08-01T10:00:00Z',
  } as unknown as Inventory;
}

// TCK-1734 — type, statut et page se lisent et s'écrivent dans l'URL.
vi.mock('next/navigation', async () => (await import('@/test/navigation-url')).moduleNavigation);

vi.mock('@/lib/queries/inventory', () => ({
  useInventories: (params: InventoryListParams) => {
    appels.params.push(params);
    const page = params.page ?? 1;
    return {
      isLoading: false,
      isError: false,
      error: null,
      data: {
        data: [ligne(page)],
        meta: { current_page: page, last_page: 3, total: 3, per_page: 1 },
      },
      refetch: vi.fn(),
    };
  },
}));

function monte() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <InventoryList canCreate />
      </QueryClientProvider>,
    ),
  );
}

function dernierAppel(): InventoryListParams {
  return appels.params.at(-1) as InventoryListParams;
}

/**
 * P168.01 — changer un filtre ramène à la page 1. Sans quoi un filtre posé en page 2 ou 3 peut
 * demander une page au-delà de la dernière : la liste se montre vide, sans pagination pour en sortir.
 */
describe('InventoryList — un filtre ramène à la page 1 (P168.01)', () => {
  beforeEach(() => {
    appels.params = [];
    navigationDeTest.reinitialiser();
  });

  it('remet la page à 1 quand le statut change', async () => {
    const user = userEvent.setup();
    monte();

    await user.click(screen.getByRole('button', { name: /suivant/i }));
    expect(dernierAppel().page).toBe(2);

    await user.click(screen.getAllByRole('combobox')[1]);
    await user.click(await screen.findByRole('option', { name: 'Brouillon' }));

    expect(dernierAppel()).toEqual({ status: 'draft', page: 1 });
  });

  it('remet la page à 1 quand le type change', async () => {
    const user = userEvent.setup();
    monte();

    await user.click(screen.getByRole('button', { name: /suivant/i }));
    expect(dernierAppel().page).toBe(2);

    await user.click(screen.getAllByRole('combobox')[0]);
    const options = await screen.findAllByRole('option');
    await user.click(options[1]);

    expect(dernierAppel().page).toBe(1);
    expect(dernierAppel().type).toBeDefined();
  });
});
