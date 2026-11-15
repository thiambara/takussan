/**
 * TCK-2618 (décision 4 b) — `/app/favorites` et `/app/saved-searches` rendent la page des favoris du
 * site public (`SuiviDesFavoris`) dans la coque de `/app`, chacune sur son onglet.
 *
 * Éprouvé sur les PAGES de route, montées telles que Next les rend (l'export par défaut) — pas sur un
 * composant qu'aucune route ne rend : « rien ne se perd des deux pages d'avant » se juge là où
 * l'utilisateur arrive. Les gestes portés depuis `FavoritesList` et `SavedSearchesList` sont rejoués
 * ici : carte éteinte (raison, « Biens proches », « Retirer »), états vide et erreur ; relancer,
 * régler l'alerte (`PATCH`), supprimer avec le refus dit sur la ligne (P210-03), résumé des critères.
 *
 * Le réseau est bouchonné au niveau de `fetch` : ce sont les requêtes réellement émises qui comptent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import { CONTENU_PRINCIPAL_ID } from '@/components/shared/contenu-principal';

const replace = vi.fn();
const push = vi.fn();
const etat = vi.hoisted(() => ({ chemin: '/app/favorites', params: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => etat.chemin,
  useSearchParams: () => new URLSearchParams(etat.params),
}));
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ({ id: 1 }) }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false, refreshUser: async () => 'ouverte', logout: async () => {} }),
}));
// Témoins : la coque du site ne doit pas être montée sous `/app`.
vi.mock('@/components/home/Navbar', () => ({ Navbar: () => <nav data-testid="navbar-publique" /> }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => <footer data-testid="footer-public" /> }));

const { default: PageDesFavoris } = await import('../page');
const { default: PageDesRecherches } = await import('../../saved-searches/page');
const { PublicFavoritesPage } = await import('@/components/favorites/PublicFavoritesPage');

const T = fr.search.saved;
const O = fr.favorites.suivi.onglets;
const P = fr.favorites.page;

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

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });

function recherche(id: number, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    user_id: 1,
    name,
    criteria: { city: name },
    notification_frequency: 'daily',
    is_active: true,
    results_count: 0,
    alert_channels: ['inapp'],
    created_at: null,
    last_viewed_at: null,
    ...extra,
  };
}

type Appel = { url: URL; method: string; body: unknown };
let appels: Appel[] = [];
let recherches: unknown[] = [];
let favoris: { status: number; corps: unknown } = { status: 200, corps: { data: [], meta: { current_page: 1, last_page: 1, per_page: 24, total: 0 } } };
let reponseSuppression: () => Response = () => new Response(null, { status: 204 });

beforeEach(() => {
  stubObservateur();
  appels = [];
  replace.mockReset();
  push.mockReset();
  etat.params = '';
  recherches = [recherche(7, 'Dakar'), recherche(8, 'Thiès', { notification_frequency: 'off', alert_channels: [] })];
  favoris = { status: 200, corps: { data: [], meta: { current_page: 1, last_page: 1, per_page: 24, total: 0 } } };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (u: string, init?: RequestInit) => {
      const url = new URL(String(u), 'http://api.test');
      const method = init?.method ?? 'GET';
      appels.push({ url, method, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
      if (url.pathname === '/api/favorites' && method === 'GET') return json(favoris.corps, favoris.status);
      if (url.pathname.startsWith('/api/favorites') && method === 'DELETE') return new Response(null, { status: 204 });
      if (url.pathname === '/api/saved-searches' && method === 'GET') return json({ data: recherches });
      if (url.pathname.startsWith('/api/saved-searches/') && method === 'PATCH') return json({ data: recherches[0] });
      if (url.pathname.startsWith('/api/saved-searches/') && method === 'DELETE') return reponseSuppression();
      return json({ data: [], meta: { total: 0 } });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

async function monter(page: 'favoris' | 'recherches') {
  etat.chemin = page === 'favoris' ? '/app/favorites' : '/app/saved-searches';
  const element = page === 'favoris' ? await PageDesFavoris() : await PageDesRecherches();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>{element}</ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

const onglet = (nom: string) => screen.getByRole('tab', { name: new RegExp(`^${nom}`) });

describe('TCK-2618 — la page du site, dans la coque de `/app`', () => {
  it('`/app/saved-searches` : l’onglet « Recherches » ouvert, sans `Navbar`, sans `Footer`, sans second `<main>`', async () => {
    const { container } = await monter('recherches');
    await screen.findAllByTestId('recherche-suivie');
    expect(onglet(O.recherches)).toHaveAttribute('aria-selected', 'true');
    expect(onglet(O.biens)).toHaveAttribute('aria-selected', 'false');
    expect(screen.queryByTestId('navbar-publique')).toBeNull();
    expect(screen.queryByTestId('footer-public')).toBeNull();
    // Le lien d'évitement vise le `<main>` de la coque de `/app` : la page n'en pose pas un second.
    expect(container.querySelector('main')).toBeNull();
    expect(container.querySelector(`#${CONTENU_PRINCIPAL_ID}`)).toBeNull();
  });

  it('`/app/favorites` : l’onglet « Biens » ouvert ; changer d’onglet change de ROUTE', async () => {
    const user = userEvent.setup();
    await monter('favoris');
    await screen.findByText(P.empty);
    expect(onglet(O.biens)).toHaveAttribute('aria-selected', 'true');
    await user.click(onglet(O.recherches));
    expect(replace).toHaveBeenCalledWith('/app/saved-searches', { scroll: false });
  });

  it('`/app/saved-searches` → « Biens » mène à `/app/favorites`', async () => {
    const user = userEvent.setup();
    await monter('recherches');
    await screen.findAllByTestId('recherche-suivie');
    await user.click(onglet(O.biens));
    expect(replace).toHaveBeenCalledWith('/app/favorites', { scroll: false });
  });
});

describe('TCK-2618 — rien ne se perd de `/app/saved-searches` (`SavedSearchesList`)', () => {
  const IDS: Record<string, string> = { Dakar: '7', Thiès: '8' };
  const ligne = (nom: string) =>
    screen.getAllByTestId('recherche-suivie').find((l) => l.dataset.searchId === IDS[nom]) as HTMLElement;

  it('AC5 — désactiver l’alerte d’une recherche : `PATCH { notification_frequency: "off" }` sur CETTE recherche', async () => {
    const user = userEvent.setup();
    await monter('recherches');
    await screen.findAllByTestId('recherche-suivie');
    const reglage = within(ligne('Dakar')).getByRole('group', { name: T.alertAria.replace('{name}', 'Dakar') });
    expect(within(reglage).getByRole('button', { name: T.frequency.daily })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(reglage).getByRole('button', { name: T.frequency.off }));

    await waitFor(() => expect(appels.some((a) => a.method === 'PATCH')).toBe(true));
    const patch = appels.find((a) => a.method === 'PATCH')!;
    expect(patch.url.pathname).toBe('/api/saved-searches/7');
    expect(patch.body).toEqual({ notification_frequency: 'off' });
  });

  it('les canaux de l’alerte restent dits sur la ligne ; une alerte coupée ne promet rien', async () => {
    await monter('recherches');
    await screen.findAllByTestId('recherche-suivie');
    expect(ligne('Dakar')).toHaveTextContent(fr.search.alertChannels.inapp);
    expect(ligne('Thiès')).toHaveTextContent(fr.favorites.suivi.recherches.sansAlerte);
  });

  it('relancer : la ligne mène aux résultats, filtres rejoués, sous la langue du site', async () => {
    recherches = [recherche(7, 'Mes villes', { criteria: { cities: ['Dakar', 'Thiès'] } })];
    await monter('recherches');
    const l = (await screen.findAllByTestId('recherche-suivie'))[0];
    expect(l).toHaveTextContent('Dakar · Thiès');
    const lien = within(l).getAllByRole('link')[0];
    expect(lien.getAttribute('href')).toMatch(/^\/fr\/properties\?/);
    expect(lien.getAttribute('href')).toContain('cities=Dakar%2CThi%C3%A8s');
  });

  it('le résumé nomme les équipements', async () => {
    recherches = [recherche(7, 'Avec piscine', { criteria: { tags: 'Piscine,Hammam maison' } })];
    await monter('recherches');
    const l = (await screen.findAllByTestId('recherche-suivie'))[0];
    expect(l).toHaveTextContent('Équipements : Piscine, Hammam maison');
  });

  it('P210-03 — une suppression refusée se dit sur SA ligne, qui reste ; un nouvel essai efface le message', async () => {
    const MESSAGE_API = 'Suppression impossible pour le moment';
    const reponses = [
      () => json({ message: MESSAGE_API }, 500),
      () => new Response(null, { status: 204 }),
    ];
    reponseSuppression = () => reponses.shift()!();
    const user = userEvent.setup();
    await monter('recherches');
    await screen.findAllByTestId('recherche-suivie');

    const bouton = within(ligne('Dakar')).getByRole('button', { name: T.deleteAria.replace('{name}', 'Dakar') });
    await user.click(bouton);
    expect(await within(ligne('Dakar')).findByRole('alert')).toHaveTextContent(MESSAGE_API);
    expect(within(ligne('Thiès')).queryByRole('alert')).toBeNull();
    expect(appels.filter((a) => a.method === 'DELETE').map((a) => a.url.pathname)).toEqual(['/api/saved-searches/7']);

    await user.click(bouton);
    await waitFor(() => expect(appels.filter((a) => a.method === 'DELETE')).toHaveLength(2));
    await waitFor(() => expect(within(ligne('Dakar')).queryByRole('alert')).toBeNull());
  });

  it('« Gérer mes alertes » n’est pas rendu : il mènerait à la page même', async () => {
    await monter('recherches');
    await screen.findAllByTestId('recherche-suivie');
    expect(screen.queryByRole('link', { name: fr.favorites.suivi.recherches.gerer })).toBeNull();
  });

  it('état vide : « Aucune recherche », et le chemin vers les biens', async () => {
    recherches = [];
    await monter('recherches');
    expect(await screen.findByText(fr.favorites.suivi.recherches.videTitre)).toBeInTheDocument();
  });
});

describe('TCK-2618 — rien ne se perd de `/app/favorites` (`FavoritesList`)', () => {
  it('un favori loué : éteint, sa raison, « Biens proches » et « Retirer » (→ DELETE)', async () => {
    favoris = {
      status: 200,
      corps: {
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
      },
    };
    const user = userEvent.setup();
    await monter('favoris');
    const eteinte = await screen.findByTestId('favorite-unavailable');
    expect(eteinte).toHaveTextContent('Loué');
    expect(eteinte).toHaveTextContent('Appartement Plateau');
    expect(within(eteinte).getByRole('link', { name: 'Biens proches' }).getAttribute('href')).toMatch(/^\/fr\/properties/);
    await user.click(within(eteinte).getByRole('button', { name: /Retirer/ }));
    await waitFor(() => expect(appels.some((a) => a.method === 'DELETE' && a.url.pathname.startsWith('/api/favorites'))).toBe(true));
  });

  it('état vide : « Découvrir des biens » sous la langue du site', async () => {
    await monter('favoris');
    expect(await screen.findByText(P.empty)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: P.discoverCta })).toHaveAttribute('href', '/fr/properties');
  });

  it('erreur : le message et « Réessayer »', async () => {
    favoris = { status: 500, corps: { message: 'boom' } };
    await monter('favoris');
    expect(await screen.findByText(P.error)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: fr.common.actions.retry })).toBeInTheDocument();
  });
});

describe('TCK-2618 — la page du SITE garde sa forme : la gestion reste derrière « Gérer mes alertes »', () => {
  it('`/fr/favorites?tab=searches` : sa coque, le lien vers `/app/saved-searches`, aucun réglage ni suppression', async () => {
    etat.chemin = '/fr/favorites';
    etat.params = 'tab=searches';
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      withIntl(
        <QueryClientProvider client={client}>
          <ToastProvider>
            <PublicFavoritesPage />
          </ToastProvider>
        </QueryClientProvider>,
      ),
    );
    await screen.findAllByTestId('recherche-suivie');
    expect(screen.getByTestId('navbar-publique')).toBeInTheDocument();
    expect(container.querySelector(`main#${CONTENU_PRINCIPAL_ID}`)).not.toBeNull();
    expect(screen.getByRole('link', { name: fr.favorites.suivi.recherches.gerer })).toHaveAttribute('href', '/app/saved-searches');
    expect(container.querySelector('[data-slot="gestion-de-la-recherche"]')).toBeNull();
    expect(screen.queryByRole('button', { name: T.deleteAria.replace('{name}', 'Dakar') })).toBeNull();
    // Le site garde `?tab=` : changer d'onglet ne change pas de route.
    await userEvent.setup().click(onglet(O.biens));
    expect(replace).toHaveBeenCalledWith('/fr/favorites', { scroll: false });
  });
});
