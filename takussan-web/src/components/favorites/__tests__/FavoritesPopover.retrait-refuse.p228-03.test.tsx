/**
 * P228.03 (TCK-2214) — retirer un favori depuis le menu des favoris suit le contrat de
 * `FavoriteButton` : le store est retourné tout de suite, et remis en état si l'API refuse. Avant,
 * `removeOne` lançait `removeMutation.mutate` sans `onError` : sur un refus, le bien disparaissait
 * du menu et des cœurs de la session, mais restait en base.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ApiError } from '@/lib/api';
import { getIds } from '@/lib/favoritesStore';
import { withIntl } from '@/test/intl';
import { FavoritesPopover } from '../FavoritesPopover';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/fr',
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 3 }, token: 'jeton', isLoading: false }),
}));

// P243.01 (TCK-2361) — le menu attend désormais la promesse de `mutateAsync` : c'est elle qui est
// doublée ici. Le contrat avec la vraie mutation est gardé par `…p243-01.test.tsx`.
const retrait = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
vi.mock('@/lib/queries/favorites', () => ({
  usePropertiesByIdsQuery: () => ({
    data: {
      data: [
        {
          id: 624,
          slug: 'villa-624',
          title: 'Villa aux Almadies',
          main_photo_url: null,
          location: { quarter: 'Almadies', city: 'Dakar' },
          price: 1000000,
          currency: 'XOF',
        },
      ],
      meta: { requested_ids: [624], returned_ids: [624] },
    },
    isLoading: false,
  }),
  useRemoveFavoriteMutation: () => retrait,
}));

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    withIntl(
      <QueryClientProvider client={client}>
        <FavoritesPopover />
      </QueryClientProvider>,
    ),
  );
}

async function retirerDepuisLeMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /favoris/i }));
  await screen.findByRole('dialog', { name: 'Mes favoris' });
  await user.click(screen.getByRole('button', { name: 'Retirer ce bien des favoris' }));
}

describe('<FavoritesPopover> — un retrait refusé revient en arrière (P228.03)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('takussan.favorites', JSON.stringify([624]));
    retrait.mutateAsync.mockReset();
  });
  afterEach(() => {
    cleanup();
  });

  it('l’API refuse : le bien revient dans les favoris', async () => {
    retrait.mutateAsync.mockRejectedValue(new ApiError(500, { message: 'panne' }));
    rendre();

    await retirerDepuisLeMenu();

    expect(retrait.mutateAsync).toHaveBeenCalledWith({ property_id: 624 });
    await waitFor(() => expect(getIds()).toContain(624));
  });

  it('l’API accepte : le bien reste retiré', async () => {
    retrait.mutateAsync.mockResolvedValue({});
    rendre();

    await retirerDepuisLeMenu();

    await waitFor(() => expect(retrait.mutateAsync).toHaveBeenCalledTimes(1));
    expect(getIds()).not.toContain(624);
  });
});
