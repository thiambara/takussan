import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { navigationDeTest } from '@/test/navigation-url';
import { InventoryList } from '../InventoryList';
import type { InventoryListParams } from '@/lib/queries/inventory';

vi.mock('next/navigation', async () => (await import('@/test/navigation-url')).moduleNavigation);

const appels = vi.hoisted(() => ({ params: [] as unknown[] }));
vi.mock('@/lib/queries/inventory', () => ({
  useInventories: (params: InventoryListParams) => {
    appels.params.push(params);
    const page = params.page ?? 1;
    return {
      isLoading: false,
      isError: false,
      error: null,
      data: { data: [{ id: page, lease_id: page, property_id: page, type: 'move_in', status: 'draft', conducted_at: null, rooms: [], created_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-01T10:00:00Z' }], meta: { current_page: page, last_page: 3, total: 3, per_page: 1 } },
      refetch: vi.fn(),
    };
  },
}));

function monte() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}><InventoryList /></QueryClientProvider>));
}

/**
 * TCK-1734 (P168.03) — type, statut et page des états des lieux vivent dans l'URL. Tenus en
 * `useState`, ils se perdaient au retour de la fiche ouverte d'un clic, au rechargement et au lien
 * copié.
 */
describe('InventoryList — la vue dans l’URL (TCK-1734)', () => {
  beforeEach(() => {
    appels.params = [];
    navigationDeTest.reinitialiser();
  });

  it('ouvre la vue que porte l’URL', () => {
    navigationDeTest.reinitialiser('type=move_out&status=signed&page=2');
    monte();

    expect(appels.params.at(-1)).toEqual({ type: 'move_out', status: 'signed', page: 2 });
  });

  it('ignore les valeurs inconnues', () => {
    navigationDeTest.reinitialiser('type=bidon&status=bidon&page=-3');
    monte();

    expect(appels.params.at(-1)).toEqual({ page: 1 });
  });

  it('écrit le statut dans l’URL, et revient à la page 1', async () => {
    navigationDeTest.reinitialiser('page=2');
    const user = userEvent.setup();
    monte();

    await user.click(screen.getAllByRole('combobox')[1]);
    await user.click(await screen.findByRole('option', { name: 'Brouillon' }));

    expect(navigationDeTest.replace).toHaveBeenLastCalledWith('?status=draft', { scroll: false });
  });

  it('écrit la page dans l’URL', async () => {
    const user = userEvent.setup();
    monte();

    await user.click(screen.getByRole('button', { name: /suivant/i }));

    expect(navigationDeTest.replace).toHaveBeenLastCalledWith('?page=2', { scroll: false });
  });
});
