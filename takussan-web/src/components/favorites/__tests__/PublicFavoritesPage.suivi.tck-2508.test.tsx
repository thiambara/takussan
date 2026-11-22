/**
 * TCK-2508 — la page Favoris « Le suivi », rendue pour l'anonyme ET pour le connecté.
 *
 * - AC1 : `price_change = -50000` affiche « −50 000 F » ; `null` (et 0) n'affiche aucune pastille.
 * - AC2 : « 3 nouveaux » sous une recherche ; l'ouvrir POSTe `…/viewed` en arrière-plan (keepalive),
 *   SANS retenir la navigation, et au retour (liste relue, `last_viewed_at` avancé) le compte repart
 *   de zéro — un nouvel onglet (Ctrl/Cmd/Maj, clic du milieu) marque aussi.
 * - Revue : un jeton sans utilisateur résolu n'affiche jamais la page de l'anonyme ; le connecté
 *   ne lit que `price_change` ; « Prévenez-moi » de l'anonyme ; « Biens proches » filtré.
 * - AC4 : anonyme, favori ajouté à 300 000 relu à 250 000 → l'écart s'affiche.
 *
 * Le réseau est bouchonné au niveau de `fetch` : ce sont les URL réellement émises qui comptent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { CompareProvider } from '@/context/CompareContext';
import { ToastProvider } from '@/components/ui/toast';
import { add as storeAdd, FAVORITES_FACETS_STORAGE_KEY } from '@/lib/favoritesStore';
import { PublicFavoritesPage } from '../PublicFavoritesPage';

const push = vi.fn();
const replace = vi.fn();
let recherche = new URLSearchParams('');
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/fr/favorites',
  useSearchParams: () => recherche,
}));

type Auth = {
  user: { id: number } | null;
  token: string | null;
  isLoading: boolean;
  refreshUser: () => Promise<void>;
};
let auth: Auth = { user: null, token: null, isLoading: false, refreshUser: async () => {} };
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/components/home/Navbar', () => ({ Navbar: () => null }));
vi.mock('@/components/home/NavbarSpacer', () => ({ NavbarSpacer: () => null }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => null }));

function stubObservateur() {
  class ObservateurInerte {
    observe() {}
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
}

function bien(id: number, price: number, title: string) {
  return {
    id,
    slug: `bien-${id}`,
    title,
    price,
    currency: 'XOF',
    type: 'apartment',
    contract_type: 'rent',
    rent_period: 'monthly',
    bedrooms: 2,
    bathrooms: 1,
    area: 80,
    furnished: false,
    featured: false,
    main_photo_url: null,
    published_at: '2026-10-01T10:00:00Z',
    created_at: '2026-10-01T10:00:00Z',
    location: { quarter: 'Mermoz', city: 'Dakar', region: null, country: null, latitude: null, longitude: null },
  };
}

function favori(id: number, propertyId: number, price_change: number | null, title: string) {
  return {
    id,
    property_id: propertyId,
    user_id: 1,
    notes: null,
    created_at: '2026-11-01T09:00:00Z',
    availability: 'available',
    price_change,
    property: bien(propertyId, 450_000, title),
  };
}

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });

type Appel = { url: URL; method: string };
let appels: Appel[] = [];

function monte() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <CompareProvider>
            <PublicFavoritesPage />
          </CompareProvider>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

/** Le texte d'une pastille, espaces insécables ramenées à des espaces ordinaires. */
function texteDe(el: HTMLElement): string {
  return (el.textContent ?? '').replace(/[  ]/g, ' ');
}

/**
 * Clique un lien et rend `true` si un gestionnaire a RETENU la navigation (`preventDefault`).
 * Écouté au document, donc après le `onClick` de React ; la navigation de jsdom est ensuite coupée.
 */
function cliqueEtDitSiRetenu(lien: HTMLElement, init: MouseEventInit = {}): boolean {
  let retenu = false;
  const ecoute = (e: Event) => {
    retenu = e.defaultPrevented;
    e.preventDefault();
  };
  document.addEventListener('click', ecoute);
  fireEvent.click(lien, init);
  document.removeEventListener('click', ecoute);
  return retenu;
}

beforeEach(() => {
  stubObservateur();
  localStorage.clear();
  appels = [];
  push.mockReset();
  replace.mockReset();
  recherche = new URLSearchParams('');
});
afterEach(() => vi.unstubAllGlobals());

describe('anonyme — AC4', () => {
  beforeEach(() => {
    auth = { user: null, token: null, isLoading: false, refreshUser: async () => {} };
  });

  it('un favori ajouté à 300 000 et relu à 250 000 affiche −50 000 F ; sans prix d’ajout, aucune pastille', async () => {
    storeAdd(10, 300_000);
    storeAdd(11); // ajouté sans prix retenu (réseau tombé au moment du geste)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (u: string) => {
        appels.push({ url: new URL(String(u), 'http://api.test'), method: 'GET' });
        return json({
          data: [bien(10, 250_000, 'Appartement Mermoz'), bien(11, 400_000, 'Studio Point E')],
          meta: { requested_ids: [10, 11], returned_ids: [10, 11] },
        });
      }),
    );

    monte();

    const cartes = await screen.findAllByTestId('favori-suivi');
    const mermoz = cartes.find((c) => c.dataset.propertyId === '10') as HTMLElement;
    const pointE = cartes.find((c) => c.dataset.propertyId === '11') as HTMLElement;
    const pastille = within(mermoz).getByTestId('pastille-ecart');
    expect(texteDe(pastille)).toMatch(/−50 000 F/);
    expect(pastille.dataset.sens).toBe('baisse');
    expect(texteDe(pastille)).toMatch(/depuis l'ajout/);
    expect(within(pointE).queryByTestId('pastille-ecart')).toBeNull();
    // La carte de compte, pas une barrière : la liste est rendue avec elle.
    expect(screen.getByTestId('carte-de-compte')).toHaveTextContent('Continuer avec mon numéro');
    expect(within(screen.getByTestId('carte-de-compte')).getByRole('link')).toHaveAttribute(
      'href',
      `/auth/login?redirect=${encodeURIComponent('/fr/favorites')}`,
    );
    // Plus récent d'abord.
    expect(cartes.map((c) => c.dataset.propertyId)).toEqual(['11', '10']);
    // L'anonyme n'a pas d'onglet Recherches : aucune requête de recherches sauvegardées.
    expect(appels.some((a) => a.url.pathname.includes('saved-searches'))).toBe(false);
  });
});

describe('connecté — AC1 et AC2', () => {
  beforeEach(() => {
    auth = { user: { id: 1 }, token: 'jeton', isLoading: false, refreshUser: async () => {} };
  });

  it('AC1 — price_change -50000 → « −50 000 F » ; null et 0 → aucune pastille (pas « 0 F »)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (u: string) => {
        const url = new URL(String(u), 'http://api.test');
        appels.push({ url, method: 'GET' });
        if (url.pathname === '/api/favorites') {
          return json({
            data: [favori(1, 10, -50000, 'Villa Ngor'), favori(2, 11, null, 'Studio Fann'), favori(3, 12, 0, 'Duplex Ouakam')],
            meta: { current_page: 1, last_page: 1, per_page: 24, total: 3 },
          });
        }
        return json({ data: [] });
      }),
    );

    monte();

    const cartes = await screen.findAllByTestId('favori-suivi');
    expect(cartes).toHaveLength(3);
    const [ngor, fann, ouakam] = cartes;
    expect(texteDe(within(ngor).getByTestId('pastille-ecart'))).toMatch(/^.*−50 000 F/);
    expect(texteDe(within(ngor).getByTestId('pastille-ecart'))).toMatch(/enregistrement dans votre compte/);
    expect(within(fann).queryByTestId('pastille-ecart')).toBeNull();
    expect(within(ouakam).queryByTestId('pastille-ecart')).toBeNull();
    for (const c of [fann, ouakam]) expect(texteDe(c)).not.toMatch(/[−+]0 F/);
    // Les gestes de chaque carte : Visiter (vers la fiche) et WhatsApp.
    expect(within(ngor).getByRole('link', { name: 'Visiter : Villa Ngor' })).toHaveAttribute('href', '/fr/properties/bien-10');
    expect(within(ngor).getByRole('button', { name: /WhatsApp/ })).toBeInTheDocument();
    // La note personnelle reste.
    expect(within(ngor).getByRole('button', { name: /Ajouter une note/ })).toBeInTheDocument();
  });

  it('connecté : l’écart est celui de l’API, jamais celui du prix gardé par l’appareil', async () => {
    // Ajouté anonyme à 500 000, versé au compte à la connexion à 450 000 (price_change = 0) : le
    // prix local ne compte plus. Un autre appareil du même compte montrerait la même chose.
    storeAdd(10, 500_000);
    storeAdd(11, 900_000);
    storeAdd(12, 100_000);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (u: string) => {
        const url = new URL(String(u), 'http://api.test');
        if (url.pathname === '/api/favorites') {
          return json({
            data: [favori(1, 10, 0, 'Villa Ngor'), favori(2, 11, null, 'Studio Fann'), favori(3, 12, -20_000, 'Duplex Ouakam')],
            meta: { current_page: 1, last_page: 1, per_page: 24, total: 3 },
          });
        }
        return json({ data: [] });
      }),
    );

    monte();

    const [ngor, fann, ouakam] = await screen.findAllByTestId('favori-suivi');
    expect(within(ngor).queryByTestId('pastille-ecart')).toBeNull();
    expect(within(fann).queryByTestId('pastille-ecart')).toBeNull();
    const pastille = within(ouakam).getByTestId('pastille-ecart');
    expect(texteDe(pastille)).toMatch(/−20 000 F/);
    expect(texteDe(pastille)).toMatch(/enregistrement dans votre compte/);
  });

  it('AC2 — « 3 nouveaux » ; ouvrir navigue tout de suite et marque vue à côté ; au retour, plus de compte', async () => {
    recherche = new URLSearchParams('tab=searches');
    const A = '2026-11-01T10:00:00+00:00';
    const B = '2026-11-09T08:00:00+00:00';
    let vueA = A;
    const vues: Array<{ keepalive: boolean; auth: string | null }> = [];
    let rendreLaVue: () => void = () => {};
    const reponseDeLaVue = new Promise<void>((r) => {
      rendreLaVue = r;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (u: string, init?: RequestInit) => {
        const url = new URL(String(u), 'http://api.test');
        const method = init?.method ?? 'GET';
        appels.push({ url, method });
        if (url.pathname === '/api/favorites') {
          return json({ data: [], meta: { current_page: 1, last_page: 1, per_page: 24, total: 0 } });
        }
        if (url.pathname === '/api/saved-searches/7/viewed' && method === 'POST') {
          vues.push({ keepalive: init?.keepalive === true, auth: new Headers(init?.headers).get('Authorization') });
          await reponseDeLaVue;
          vueA = B;
          return new Response(null, { status: 204 });
        }
        if (url.pathname === '/api/saved-searches') {
          return json({
            data: [
              {
                id: 7,
                user_id: 1,
                name: 'Appartement · Mermoz',
                criteria: { contract_type: 'rent', location: 'Mermoz' },
                notification_frequency: 'daily',
                is_active: true,
                results_count: null,
                alert_channels: ['inapp', 'whatsapp'],
                last_viewed_at: vueA,
                created_at: '2026-10-01T10:00:00+00:00',
              },
            ],
          });
        }
        if (url.pathname === '/api/public/properties/search') {
          const depuis = url.searchParams.get('published_after');
          return depuis === A
            ? json({ data: [bien(20, 300_000, 'Neuf 1'), bien(21, 310_000, 'Neuf 2'), bien(22, 320_000, 'Neuf 3')], meta: { total: 3 } })
            : json({ data: [], meta: { total: 0 } });
        }
        return json({ data: [] });
      }),
    );
    monte();

    const ligne = await screen.findByTestId('recherche-suivie');
    expect(await within(ligne).findByTestId('compte-nouveaux')).toHaveTextContent('3 nouveaux');
    expect(within(ligne).getByText(/Chaque jour, dans l'application, par WhatsApp/)).toBeInTheDocument();
    // La requête suit le contrat : published_after = last_viewed_at, placements=false.
    const compte = appels.find((a) => a.url.pathname === '/api/public/properties/search');
    expect(compte?.url.searchParams.get('published_after')).toBe(A);
    expect(compte?.url.searchParams.get('placements')).toBe('false');
    expect(compte?.url.searchParams.get('location')).toBe('Mermoz');
    expect(screen.getByTestId('badge-nouveaux')).toHaveTextContent('3');

    const lien = screen.getByRole('link', { name: 'Ouvrir la recherche « Appartement · Mermoz »' });
    expect(lien).toHaveAttribute('href', '/fr/properties?contract_type=rent&location=Mermoz');

    // Le POST est encore en vol : la navigation n'a pas été retenue pour l'attendre.
    expect(cliqueEtDitSiRetenu(lien)).toBe(false);
    await waitFor(() => expect(vues).toHaveLength(1));
    expect(vues[0]).toEqual({ keepalive: true, auth: 'Bearer jeton' });
    expect(push).not.toHaveBeenCalled();
    expect(within(screen.getByTestId('recherche-suivie')).getByTestId('compte-nouveaux')).toBeInTheDocument();

    await act(async () => rendreLaVue());

    // « Revenu » : la liste relue porte B, le compte repart de zéro.
    await waitFor(() => expect(within(screen.getByTestId('recherche-suivie')).queryByTestId('compte-nouveaux')).toBeNull());
    expect(appels.some((a) => a.url.searchParams.get('published_after') === B)).toBe(true);
    expect(screen.queryByTestId('badge-nouveaux')).toBeNull();
  });

  it('ouvrir dans un nouvel onglet (Ctrl, Cmd, Maj, clic du milieu) marque aussi la recherche vue — le clic droit, non', async () => {
    recherche = new URLSearchParams('tab=searches');
    const vues: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (u: string, init?: RequestInit) => {
        const url = new URL(String(u), 'http://api.test');
        const method = init?.method ?? 'GET';
        if (url.pathname === '/api/favorites') {
          return json({ data: [], meta: { current_page: 1, last_page: 1, per_page: 24, total: 0 } });
        }
        if (url.pathname.endsWith('/viewed') && method === 'POST') {
          vues.push(url.pathname);
          return new Response(null, { status: 204 });
        }
        if (url.pathname === '/api/saved-searches') {
          return json({
            data: [
              {
                id: 9,
                user_id: 1,
                name: 'Villa · Ngor',
                criteria: { contract_type: 'sale', location: 'Ngor' },
                notification_frequency: 'off',
                is_active: true,
                results_count: null,
                alert_channels: [],
                last_viewed_at: '2026-11-01T10:00:00+00:00',
                created_at: '2026-10-01T10:00:00+00:00',
              },
            ],
          });
        }
        return json({ data: [], meta: { total: 0 } });
      }),
    );

    monte();

    const lien = await screen.findByRole('link', { name: 'Ouvrir la recherche « Villa · Ngor »' });
    expect(cliqueEtDitSiRetenu(lien, { ctrlKey: true })).toBe(false);
    await waitFor(() => expect(vues).toEqual(['/api/saved-searches/9/viewed']));
    cliqueEtDitSiRetenu(lien, { metaKey: true });
    cliqueEtDitSiRetenu(lien, { shiftKey: true });
    fireEvent(lien, new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    await waitFor(() => expect(vues).toHaveLength(4));
    fireEvent(lien, new MouseEvent('auxclick', { bubbles: true, button: 2 }));
    await new Promise((r) => setTimeout(r, 30));
    expect(vues).toHaveLength(4);
  });

  it('un favori loué reste visible, éteint, avec sa raison, « Biens proches » et « Retirer »', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (u: string) => {
        const url = new URL(String(u), 'http://api.test');
        if (url.pathname === '/api/favorites') {
          return json({
            data: [
              {
                id: 5,
                property_id: 15,
                user_id: 1,
                notes: null,
                created_at: '2026-11-01T09:00:00Z',
                availability: 'rented',
                price_change: null,
                property: { id: 15, slug: 'loue', title: 'Appartement Plateau' },
              },
            ],
            meta: { current_page: 1, last_page: 1, per_page: 24, total: 1 },
          });
        }
        return json({ data: [] });
      }),
    );

    monte();

    const eteinte = await screen.findByTestId('favorite-unavailable');
    expect(eteinte).toHaveTextContent('Loué');
    expect(eteinte).toHaveTextContent('Appartement Plateau');
    expect(within(eteinte).getByRole('link', { name: 'Biens proches' })).toBeInTheDocument();
    expect(within(eteinte).getByRole('button', { name: /Retirer/ })).toBeInTheDocument();
    expect(eteinte).not.toHaveTextContent(/F CFA/);
  });
});

describe('revue — persona, alerte de l’anonyme, biens proches', () => {
  it('un jeton sans utilisateur résolu : attente neutre et relecture de /me, jamais la page de l’anonyme', async () => {
    storeAdd(10, 300_000);
    let rendre: () => void = () => {};
    const refreshUser = vi.fn(
      () =>
        new Promise<void>((r) => {
          rendre = r;
        }),
    );
    auth = { user: null, token: 'jeton', isLoading: false, refreshUser };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (u: string) => {
        appels.push({ url: new URL(String(u), 'http://api.test'), method: 'GET' });
        return json({ data: [] });
      }),
    );

    monte();

    expect(screen.getByTestId('favoris-en-attente')).toBeInTheDocument();
    expect(refreshUser).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('carte-de-compte')).toBeNull();
    expect(screen.queryByText(/sur cet appareil/)).toBeNull();

    // `/me` ne répond toujours pas : une erreur qui propose de réessayer, toujours pas l'anonyme.
    await act(async () => rendre());
    expect(await screen.findByText(/Votre compte ne répond pas pour l'instant/)).toBeInTheDocument();
    expect(screen.queryByTestId('carte-de-compte')).toBeNull();
    expect(screen.queryByTestId('favori-suivi')).toBeNull();
    expect(appels.some((a) => a.url.pathname.includes('by-ids'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(refreshUser).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('favoris-en-attente')).toBeInTheDocument();
  });

  it('anonyme : « Prévenez-moi … à Mermoz » ouvre l’alerte sans compte, avec le quartier et la transaction de la sélection', async () => {
    auth = { user: null, token: null, isLoading: false, refreshUser: async () => {} };
    storeAdd(10);
    storeAdd(11);
    storeAdd(12);
    let envoi: Record<string, unknown> | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (u: string, init?: RequestInit) => {
        const url = new URL(String(u), 'http://api.test');
        if (url.pathname === '/api/public/search-alerts/capabilities') {
          return json({ data: { channels: ['email'] } });
        }
        if (url.pathname === '/api/public/search-alerts' && init?.method === 'POST') {
          envoi = JSON.parse(String(init.body)) as Record<string, unknown>;
          return json({ data: null }, 202);
        }
        const fann = { ...bien(12, 500_000, 'Studio Fann'), location: { ...bien(12, 0, '').location, quarter: 'Fann' } };
        return json({
          data: [bien(10, 250_000, 'Appartement Mermoz'), bien(11, 400_000, 'Studio Mermoz'), fann],
          meta: { requested_ids: [12, 11, 10], returned_ids: [12, 11, 10] },
        });
      }),
    );
    const user = userEvent.setup();

    monte();

    const declencheur = await screen.findByTestId('prevenir-de-la-selection');
    expect(declencheur).toHaveTextContent('Prévenez-moi quand un bien comme ceux-ci arrive à Mermoz');
    await user.click(declencheur);

    await user.type(await screen.findByLabelText('Adresse e-mail'), 'awa@example.sn');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Me prévenir' }));

    await waitFor(() => expect(envoi).not.toBeNull());
    expect(envoi).toMatchObject({
      criteria: { location: 'Mermoz', contract_type: 'rent' },
      email: 'awa@example.sn',
      channel: 'email',
      consent: true,
    });
    expect(String((envoi as unknown as { name: string }).name)).toMatch(/Mermoz/);
    expect(await screen.findByText('Vérifiez votre boîte e-mail')).toBeInTheDocument();
  });

  it('« Biens proches » d’un favori loué porte les filtres que l’appareil a vus du bien quand il était public', async () => {
    auth = { user: { id: 1 }, token: 'jeton', isLoading: false, refreshUser: async () => {} };
    let loue = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (u: string) => {
        const url = new URL(String(u), 'http://api.test');
        if (url.pathname === '/api/favorites') {
          return json({
            data: [
              loue
                ? {
                    id: 5,
                    property_id: 15,
                    user_id: 1,
                    notes: null,
                    created_at: '2026-11-01T09:00:00Z',
                    availability: 'rented',
                    price_change: null,
                    property: { id: 15, slug: 'loue', title: 'Appartement Plateau' },
                  }
                : favori(5, 15, null, 'Appartement Plateau'),
            ],
            meta: { current_page: 1, last_page: 1, per_page: 24, total: 1 },
          });
        }
        return json({ data: [] });
      }),
    );

    // Une première visite le montre public (Mermoz, Dakar, appartement en location)…
    const premiere = monte();
    await screen.findByTestId('favori-suivi');
    await waitFor(() => expect(localStorage.getItem(FAVORITES_FACETS_STORAGE_KEY)).toContain('Mermoz'));
    premiere.unmount();

    // … il est loué depuis : la carte éteinte renvoie vers des biens comme lui.
    loue = true;
    monte();
    const eteinte = await screen.findByTestId('favorite-unavailable');
    expect(within(eteinte).getByRole('link', { name: 'Biens proches' })).toHaveAttribute(
      'href',
      '/fr/properties?contract_type=rent&type=apartment&city=Dakar&location=Mermoz',
    );
  });
});
