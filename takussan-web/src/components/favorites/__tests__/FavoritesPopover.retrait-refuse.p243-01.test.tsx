/**
 * P243.01 (TCK-2361) — le retour arrière de P228.03 passait par l'`onError` donné à `mutate()`. En
 * TanStack Query v5, ce rappel ne part que pour le DERNIER appel, et plus du tout si le composant
 * qui tient la mutation est démonté avant la réponse : deux retraits refusés coup sur coup ne
 * remettaient que le second bien, et un retrait refusé après la fermeture du menu ne remettait
 * rien. Ce test garde le contrat avec le VRAI `useRemoveFavoriteMutation` (seul `apiRequest` est
 * doublé), là où `FavoritesPopover.retrait-refuse.p228-03.test.tsx` simule la mutation entière.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
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

/** Chaque appel à l'API reste en vol jusqu'à ce que le test le refuse. */
const enVol = vi.hoisted(() => ({ refus: [] as Array<(e: unknown) => void> }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: () =>
    new Promise((_resoudre, refuser) => {
      enVol.refus.push(refuser);
    }),
}));

function bien(id: number, titre: string) {
  return {
    id,
    slug: `bien-${id}`,
    title: titre,
    main_photo_url: null,
    location: { quarter: 'Almadies', city: 'Dakar' },
    price: 1000000,
    currency: 'XOF',
  };
}

vi.mock('@/lib/queries/favorites', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/favorites')>()),
  usePropertiesByIdsQuery: () => ({
    data: {
      data: [bien(624, 'Villa aux Almadies'), bien(625, 'Appartement au Plateau')],
      meta: { requested_ids: [624, 625], returned_ids: [624, 625] },
    },
    isLoading: false,
  }),
}));

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    withIntl(
      <QueryClientProvider client={client}>
        <FavoritesPopover />
      </QueryClientProvider>,
    ),
  );
}

async function ouvrirLeMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /favoris/i }));
  await screen.findByRole('dialog', { name: 'Mes favoris' });
  return user;
}

async function toutRefuser() {
  await act(async () => {
    for (const refuser of enVol.refus.splice(0)) refuser(new ApiError(500, { message: 'panne' }));
  });
}

describe('<FavoritesPopover> — retraits refusés avec la vraie mutation (P243.01)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('takussan.favorites', JSON.stringify([624, 625]));
    enVol.refus = [];
  });
  afterEach(() => {
    cleanup();
  });

  it('deux retraits refusés coup sur coup : les deux biens reviennent', async () => {
    rendre();
    const user = await ouvrirLeMenu();

    const [premier, second] = screen.getAllByRole('button', { name: 'Retirer ce bien des favoris' });
    await user.click(premier);
    await user.click(second);
    await waitFor(() => expect(enVol.refus).toHaveLength(2));
    expect(getIds()).toEqual([]);

    await toutRefuser();

    await waitFor(() => expect([...getIds()].sort()).toEqual([624, 625]));
  });

  it('menu fermé avant le refus : le bien revient', async () => {
    rendre();
    const user = await ouvrirLeMenu();

    await user.click(screen.getAllByRole('button', { name: 'Retirer ce bien des favoris' })[0]);
    await waitFor(() => expect(enVol.refus).toHaveLength(1));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Mes favoris' })).not.toBeInTheDocument());

    await toutRefuser();

    await waitFor(() => expect(getIds()).toContain(624));
  });
});
