/**
 * TCK-2508 (contre-vérification de la revue) — un jeton sans utilisateur résolu, avec le VRAI
 * `AuthProvider` : `refreshUser` lève `isLoading`, et l'ancienne page démontait l'attente sur ce
 * drapeau, la remontait, relançait `/me` — 13 appels en 600 ms, « Réessayer » jamais affiché.
 *
 * Ce qui est gardé : UN `/me` par montage de la page (fenêtre de 2 s simulée), jamais deux en vol,
 * « Réessayer » à l'échec ou au bout de 5 s, et jamais la page de l'anonyme pendant ce temps.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { AuthProvider } from '@/context/AuthContext';
import { CompareProvider } from '@/context/CompareContext';
import { ToastProvider } from '@/components/ui/toast';
import { add as storeAdd } from '@/lib/favoritesStore';
import { DELAI_RELECTURE_DU_COMPTE_MS, PublicFavoritesPage } from '../PublicFavoritesPage';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/fr/favorites',
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/components/home/Navbar', () => ({ Navbar: () => null }));
vi.mock('@/components/home/NavbarSpacer', () => ({ NavbarSpacer: () => null }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => null }));

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });

let appelsMe = 0;
let autres: string[] = [];
let repondreMe: (r: Response) => void = () => {};

/** `/me` répond selon `mode` : `suspendu` (jamais tant qu'on ne le libère pas), `echec`, `ok`. */
function stubReseau(mode: 'suspendu' | 'echec' | 'ok') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (u: string) => {
      const url = String(u);
      if (url.endsWith('/api/auth/me')) {
        appelsMe += 1;
        if (mode === 'echec') return json({ message: 'indisponible' }, 503);
        if (mode === 'ok') return json({ id: 86, name: 'Client', roles: [] });
        return new Promise<Response>((r) => {
          repondreMe = r;
        });
      }
      autres.push(url);
      if (url.includes('/api/favorites')) {
        return json({ data: [], meta: { current_page: 1, last_page: 1, per_page: 24, total: 0 } });
      }
      return json({ data: [] });
    }),
  );
}

function monte() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <AuthProvider initialUser={null} initialToken="jeton">
          <ToastProvider>
            <CompareProvider>
              <PublicFavoritesPage />
            </CompareProvider>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>,
    ),
  );
}

const fenetre = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const reessayer = () => screen.queryByRole('button', { name: 'Réessayer' });

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  storeAdd(10, 300_000); // l'appareil porte un favori : la page de l'anonyme aurait de quoi s'afficher
  appelsMe = 0;
  autres = [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('jeton sans utilisateur résolu — vrai AuthProvider', () => {
  it('/me suspendu : 1 appel sur 2 s, « Réessayer » au bout de 5 s, et pas un second /me en vol', async () => {
    stubReseau('suspendu');
    monte();

    await fenetre(2000);
    expect(appelsMe).toBe(1);
    expect(screen.getByTestId('favoris-en-attente')).toBeInTheDocument();
    expect(reessayer()).toBeNull();

    await fenetre(DELAI_RELECTURE_DU_COMPTE_MS - 2000);
    expect(reessayer()).not.toBeNull();
    expect(screen.getByText(/Votre compte ne répond pas pour l'instant/)).toBeInTheDocument();

    // L'appel est toujours en vol : réessayer n'en lance pas un second.
    fireEvent.click(reessayer() as HTMLElement);
    await fenetre(2000);
    expect(appelsMe).toBe(1);

    // Il échoue enfin : « Réessayer » relance, une fois.
    await act(async () => repondreMe(json({ message: 'indisponible' }, 503)));
    await fenetre(10);
    fireEvent.click(reessayer() as HTMLElement);
    await fenetre(2000);
    expect(appelsMe).toBe(2);

    // Jamais la page de l'anonyme : ni carte de compte, ni lecture by-ids.
    expect(screen.queryByTestId('carte-de-compte')).toBeNull();
    expect(autres.some((u) => u.includes('by-ids'))).toBe(false);
  });

  it('/me en échec : 1 appel sur 2 s, « Réessayer » dès l’échec, pas la page de l’anonyme', async () => {
    stubReseau('echec');
    monte();

    await fenetre(2000);
    expect(appelsMe).toBe(1);
    expect(reessayer()).not.toBeNull();
    expect(screen.queryByTestId('carte-de-compte')).toBeNull();
    expect(screen.queryByTestId('favori-suivi')).toBeNull();
    expect(autres.some((u) => u.includes('by-ids'))).toBe(false);
  });

  it('/me répond : 1 appel, puis la page du compte', async () => {
    stubReseau('ok');
    monte();

    await fenetre(2000);
    expect(appelsMe).toBe(1);
    expect(screen.queryByTestId('favoris-en-attente')).toBeNull();
    expect(screen.getByText('Synchronisés sur votre compte · le prix et la disponibilité sont suivis')).toBeInTheDocument();
    expect(autres.some((u) => u.includes('/api/favorites'))).toBe(true);
  });
});

describe('jeton mort — vrai AuthProvider', () => {
  it('/me en 401 : la session se ferme par logout() et la page de l’appareil vient, sans écran d’erreur', async () => {
    const deconnexions: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (u: string, init?: RequestInit) => {
        const url = String(u);
        if (url.endsWith('/api/auth/me')) {
          appelsMe += 1;
          return json({ message: 'Unauthenticated.' }, 401);
        }
        if (url.endsWith('/api/auth/logout')) {
          deconnexions.push(init?.method ?? 'GET');
          return json({ ok: true });
        }
        autres.push(url);
        if (url.includes('by-ids')) {
          return json({
            data: [
              {
                id: 10,
                slug: 'bien-10',
                title: 'Appartement Mermoz',
                price: 250_000,
                currency: 'XOF',
                type: 'apartment',
                contract_type: 'rent',
                rent_period: 'monthly',
                main_photo_url: null,
                location: { quarter: 'Mermoz', city: 'Dakar', region: null, country: null, latitude: null, longitude: null },
              },
            ],
            meta: { requested_ids: [10], returned_ids: [10] },
          });
        }
        return json({ data: [] });
      }),
    );
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
        takeRecords() {
          return [];
        }
      },
    );

    monte();
    await fenetre(2000);

    expect(appelsMe).toBe(1);
    expect(deconnexions.length).toBeGreaterThanOrEqual(1);
    expect(reessayer()).toBeNull();
    expect(screen.queryByText(/Votre compte ne répond pas/)).toBeNull();
    expect(screen.queryByTestId('favoris-en-attente')).toBeNull();
    // La vue de l'appareil, avec le favori qu'il portait (relu par by-ids).
    await fenetre(1000);
    expect(screen.getByTestId('carte-de-compte')).toBeInTheDocument();
    expect(screen.getByTestId('favori-suivi')).toHaveAttribute('data-property-id', '10');
  });
});
