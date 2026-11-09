/**
 * TCK-2508 — le cœur de l'anonyme retient le prix vu à l'ajout (la référence de « −50 000 F
 * depuis l'ajout »), et seulement pour l'anonyme : le connecté a `price_change` côté API.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ToastProvider } from '@/components/ui/toast';
import { withIntl } from '@/test/intl';
import { getPrixALAjout } from '@/lib/favoritesStore';
import { FavoriteButton } from '../FavoriteButton';
import { useFavorite } from '@/hooks/useFavorite';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/fr/properties',
  useSearchParams: () => new URLSearchParams(''),
}));

let auth: { user: { id: number } | null; token: string | null } = { user: null, token: null };
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ ...auth, isLoading: false }),
}));

function monte(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

let urls: string[] = [];

beforeEach(() => {
  localStorage.clear();
  urls = [];
  auth = { user: null, token: null };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (u: string) => {
      urls.push(String(u));
      if (String(u).includes('/by-ids')) {
        return new Response(JSON.stringify({ data: [{ id: 42, price: 300000 }], meta: {} }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: {} }), { status: 201 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('<FavoriteButton> — prix à l’ajout', () => {
  it('anonyme sans prix fourni : relit le prix public par by-ids et le retient', async () => {
    const user = userEvent.setup();
    monte(<FavoriteButton propertyId={42} />);
    await user.click(screen.getByRole('button', { name: /ajouter aux favoris/i }));

    await waitFor(() => expect(getPrixALAjout()[42]).toBe(300000));
    expect(urls.some((u) => /\/api\/public\/properties\/by-ids\?ids=42$/.test(u))).toBe(true);
  });

  it('anonyme avec le prix de la carte : le retient sans requête', async () => {
    const user = userEvent.setup();
    monte(<FavoriteButton propertyId={42} prix={275000} />);
    await user.click(screen.getByRole('button', { name: /ajouter aux favoris/i }));

    expect(getPrixALAjout()[42]).toBe(275000);
    expect(urls.some((u) => u.includes('/by-ids'))).toBe(false);
  });

  it('connecté : aucune relecture by-ids (le prix d’ajout vit côté API)', async () => {
    auth = { user: { id: 1 }, token: 'jeton' };
    const user = userEvent.setup();
    monte(<FavoriteButton propertyId={42} />);
    await user.click(screen.getByRole('button', { name: /ajouter aux favoris/i }));

    await waitFor(() => expect(urls.some((u) => u.includes('/api/favorites'))).toBe(true));
    expect(urls.some((u) => u.includes('/by-ids'))).toBe(false);
  });
});

describe('useFavorite (cœur de la fiche) — prix à l’ajout', () => {
  function enveloppe({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>,
    );
  }

  it('anonyme : l’ajout retient le prix public relu par by-ids', async () => {
    const { result } = renderHook(() => useFavorite(42), { wrapper: enveloppe });
    await act(() => result.current.toggle());
    await waitFor(() => expect(getPrixALAjout()[42]).toBe(300000));
  });

  it('anonyme : retirer ne relit rien', async () => {
    const { result } = renderHook(() => useFavorite(42), { wrapper: enveloppe });
    await act(() => result.current.toggle());
    await waitFor(() => expect(getPrixALAjout()[42]).toBe(300000));
    urls = [];
    await act(() => result.current.toggle());
    expect(urls).toEqual([]);
    expect(getPrixALAjout()[42]).toBeUndefined();
  });
});
