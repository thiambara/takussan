/**
 * TCK-551, tour 4 — le geste retour FERME le menu mobile, et le menu ne laisse rien dans
 * l'historique.
 *
 * Mesuré avant (`/fr/agents` à 360 × 740, défilée à 1200, menu ouvert, `history.back()`) : la page
 * précédente s'affichait, menu démonté — le geste retour d'Android, que l'Objectif du ticket nomme
 * comme une façon de fermer le menu, faisait quitter la page.
 *
 * Mécanisme : une entrée SENTINELLE à l'ouverture (cf. `useEntreeSentinelle`). Ce fichier garde
 * ses quatre issues — retour, fermeture par la croix / Échap / le voile, lien qui navigue, choix
 * de langue — et le double montage de StrictMode. Ce que fait le NAVIGATEUR de ces entrées
 * (`history.length`, page rendue par un retour, position) est mesuré au navigateur, cf. les Notes.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';

const routeur = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }));
/** Les navigations que `next/link` aurait lancées : le lien, et s'il REMPLACE l'entrée courante. */
const navigations = vi.hoisted(() => [] as Array<{ href: string; replace: boolean }>);

vi.mock('next/navigation', () => ({
  useRouter: () => routeur,
  useSearchParams: () => new URLSearchParams('contract_type=sale'),
  usePathname: () => '/fr/properties',
}));

// Comme `next/link` : le gestionnaire de l'appelant d'abord ; s'il n'a pas annulé, la navigation.
// Elle n'écrit RIEN dans l'historique ici — c'est le cas dur : chez Next, le `replaceState` arrive
// après l'aller-retour RSC, bien après une tâche.
vi.mock('next/link', () => ({
  default: React.forwardRef<HTMLAnchorElement, React.ComponentProps<'a'> & { href: string; replace?: boolean }>(
    function Lien({ href, children, replace, onClick, ...reste }, ref) {
      return (
        <a
          ref={ref}
          href={href}
          {...reste}
          onClick={(e) => {
            onClick?.(e);
            if (e.defaultPrevented) return;
            e.preventDefault();
            navigations.push({ href, replace: Boolean(replace) });
          }}
        >
          {children}
        </a>
      );
    },
  ),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false, setUser: vi.fn(), token: null, logout: vi.fn() }),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({ data: [] }),
  ApiError: class extends Error {},
}));

vi.mock('@/hooks/useSuggest', () => ({
  useSuggest: () => ({ data: undefined, isLoading: false, isFetching: false }),
}));

vi.mock('@/app/actions/locale', () => ({ setLocaleAction: vi.fn(async () => {}) }));

const { Navbar } = await import('@/components/home/Navbar');
const { MARQUE_MENU_MOBILE } = await import('@/hooks/useEntreeSentinelle');

function monter(strict = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const arbre = <QueryClientProvider client={client}>{withIntl(<Navbar />)}</QueryClientProvider>;
  return render(strict ? <React.StrictMode>{arbre}</React.StrictMode> : arbre);
}

/** La page courante : « Acheter » y mène, « Louer » en part. */
const ICI = '/fr/properties?contract_type=sale';
const menu = () => screen.queryByRole('dialog', { name: 'Menu' });
const marque = () => (window.history.state as Record<string, unknown> | null)?.[MARQUE_MENU_MOBILE];
/** Laisse passer la tâche du `history.back()` différé. */
const uneTache = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

let back: ReturnType<typeof vi.spyOn>;

async function ouvrir(strict = false) {
  const user = userEvent.setup();
  monter(strict);
  await user.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));
  const panneau = await screen.findByRole('dialog', { name: 'Menu' });
  return { user, panneau };
}

beforeEach(() => {
  // Une entrée de départ qui porte l'état de Next, comme en vrai.
  window.history.replaceState({ __NA: true }, '', ICI);
  navigations.length = 0;
  Object.values(routeur).forEach((f) => f.mockClear());
  back = vi.spyOn(window.history, 'back');
});

afterEach(() => {
  back.mockRestore();
  document.documentElement.removeAttribute('style');
  document.body.removeAttribute('style');
});

describe('Menu mobile — le geste retour le ferme (TCK-551, tour 4)', () => {
  it('à l’ouverture, UNE entrée sentinelle à la même URL, qui garde l’état de Next', async () => {
    const avant = window.history.length;
    await ouvrir();
    expect(window.history.length).toBe(avant + 1);
    expect(typeof marque()).toBe('string');
    expect((window.history.state as Record<string, unknown>).__NA).toBe(true);
    expect(window.location.pathname + window.location.search).toBe(ICI);
  });

  /**
   * Le navigateur enregistre, au `pushState`, la position de l'entrée qu'on quitte — celle qu'il
   * rend quand un retour y ramène. Posée APRÈS le verrou, elle valait 0 (`body` en `fixed`).
   */
  it('la sentinelle est posée AVANT le verrou de défilement', async () => {
    const pushState = window.history.pushState.bind(window.history);
    const positionAuPush: string[] = [];
    const espion = vi.spyOn(window.history, 'pushState').mockImplementation((...args) => {
      positionAuPush.push(document.body.style.position);
      pushState(...args);
    });
    try {
      await ouvrir();
    } finally {
      espion.mockRestore();
    }
    expect(positionAuPush).toEqual(['']);
    expect(document.body.style.position).toBe('fixed');
  });

  it('sous StrictMode, ouvrir le menu pose UNE sentinelle et le laisse ouvert (le double montage de l’effet « ouvert » est éprouvé dans useEntreeSentinelle.test)', async () => {
    const avant = window.history.length;
    await ouvrir(true);
    await uneTache();
    expect(window.history.length).toBe(avant + 1);
    expect(back).not.toHaveBeenCalled();
    expect(menu()).not.toBeNull();
  });

  it('le retour (popstate) ferme le menu, et rien d’autre : pas de second `back()`', async () => {
    await ouvrir();
    // Le navigateur a ramené l'entrée d'avant le menu, puis émet `popstate`.
    window.history.replaceState({ __NA: true }, '', ICI);
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
    });
    await waitFor(() => expect(menu()).toBeNull());
    await uneTache();
    expect(back).not.toHaveBeenCalled();
  });

  it.each([
    ['la croix', async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Fermer le menu' }))],
    ['Échap', async (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
    ['le voile', async (user: ReturnType<typeof userEvent.setup>) => user.click(document.querySelector('[data-slot="sheet-overlay"]') as HTMLElement)],
  ])('fermé par %s, il rend la sentinelle par `history.back()`', async (_nom, fermer) => {
    const { user } = await ouvrir();
    back.mockImplementation(() => {});
    await fermer(user);
    await waitFor(() => expect(menu()).toBeNull());
    await uneTache();
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('un lien du menu navigue EN REMPLAÇANT la sentinelle, et aucun `back()` ne défait la navigation', async () => {
    const { user, panneau } = await ouvrir();
    await user.click(within(panneau).getByRole('link', { name: 'Louer' }));
    await waitFor(() => expect(menu()).toBeNull());
    await uneTache();
    expect(navigations).toEqual([{ href: '/fr/properties?contract_type=rent', replace: true }]);
    expect(back).not.toHaveBeenCalled();
  });

  it('un lien vers la page COURANTE ne navigue pas : il ferme, et rend la sentinelle', async () => {
    const { user, panneau } = await ouvrir();
    back.mockImplementation(() => {});
    await user.click(within(panneau).getByRole('link', { name: 'Acheter' }));
    await waitFor(() => expect(menu()).toBeNull());
    await uneTache();
    expect(navigations).toEqual([]);
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('le choix de langue depuis le menu REMPLACE la sentinelle (pas de `push` par-dessus), sans `back()`', async () => {
    const { user, panneau } = await ouvrir();
    await user.click(within(panneau).getByRole('button', { name: 'Wolof' }));
    await waitFor(() => expect(routeur.replace).toHaveBeenCalledWith('/wo/properties?contract_type=sale'));
    expect(routeur.push).not.toHaveBeenCalled();
    await uneTache();
    expect(back).not.toHaveBeenCalled();
  });
});
