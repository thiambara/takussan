/**
 * TCK-551 — le menu mobile est une MODALE : voile, verrou de défilement, fermeture par un appui
 * dehors, par Échap et par la croix, focus tenu dedans et rendu au bouton qui l'a ouvert.
 *
 * Mesuré le 2026-09-23 à 390 × 844 avant ce ticket (N5 à N8 de l'audit du 2026-09-22) : aucun
 * voile, `html` et `body` en `overflow: visible` — un `scrollBy(0, 500)` menu ouvert faisait
 * passer `scrollY` de 0 à 500 —, et le point (195, 824), sous le panneau, tombait sur le lien d'une
 * carte de résultat : un « tap à côté » pour fermer OUVRAIT une fiche. La rangée de catégories
 * mesurait 521 px dans 342, « Connexion » avait son texte à x = 35 contre 24 (`px-2.5` de la
 * variante ET `px-0` de l'appelant, `cva` ne fusionnant pas), et « Mes favoris » tenait en 36 × 36.
 *
 * jsdom ne pose aucune feuille de style : ce qui se mesure en pixels (AC1, AC4 à AC6) l'est au
 * navigateur, cf. les Notes du ticket. Ici, on éprouve ce que le visiteur fait — Échap, un appui
 * sur le voile, Tab — et ce que le verrou ÉCRIT sur la page.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams('contract_type=sale'),
  usePathname: () => '/fr/properties',
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...reste }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...reste}>{children}</a>
  ),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false, setUser: vi.fn(), token: null }),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({ data: [] }),
  ApiError: class extends Error {},
}));

vi.mock('@/hooks/useSuggest', () => ({
  useSuggest: () => ({ data: undefined, isLoading: false, isFetching: false }),
}));

const { Navbar } = await import('@/components/home/Navbar');

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>{withIntl(<Navbar />)}</QueryClientProvider>,
  );
}

const classesDe = (el: Element | null) => (el?.className ?? '').toString().split(/\s+/);
const boutonMenu = () => screen.getByRole('button', { name: 'Ouvrir le menu' });

async function ouvrir() {
  const user = userEvent.setup();
  const rendu = monter();
  boutonMenu().focus();
  await user.click(boutonMenu());
  const panneau = await screen.findByRole('dialog', { name: 'Menu' });
  return { user, panneau, ...rendu };
}

/** Le verrou tel que base-ui le pose : `overflow` masqué sur `html` ou sur `body`. */
function pageVerrouillee(): boolean {
  const html = document.documentElement;
  const body = document.body;
  return [html, body].some((el) => /hidden|clip/.test(el.style.overflowY || el.style.overflow));
}

afterEach(() => {
  document.documentElement.removeAttribute('style');
  document.body.removeAttribute('style');
});

describe('Menu mobile — une modale (TCK-551, N5)', () => {
  it('s’ouvre en boîte de dialogue nommée, avec un voile', async () => {
    const { panneau } = await ouvrir();
    expect(panneau).toBeInTheDocument();
    expect(document.querySelector('[data-slot="sheet-overlay"]'), 'le voile est rendu').not.toBeNull();
  });

  it('un appui sur le voile ferme le menu et rend le focus au bouton menu (AC2)', async () => {
    const { user } = await ouvrir();
    const voile = document.querySelector('[data-slot="sheet-overlay"]') as HTMLElement;
    await user.click(voile);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(boutonMenu()));
  });

  it('Échap ferme le menu et rend le focus au bouton menu', async () => {
    const { user } = await ouvrir();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(boutonMenu()));
  });

  it('la croix du panneau ferme le menu et rend le focus au bouton menu', async () => {
    const { user, panneau } = await ouvrir();
    await user.click(within(panneau).getByRole('button', { name: 'Fermer le menu' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(boutonMenu()));
  });

  it('suivre un lien du menu le referme', async () => {
    const { user, panneau } = await ouvrir();
    await user.click(within(panneau).getByRole('link', { name: 'Louer' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull());
  });

  it('le document ne défile pas menu ouvert, et redevient libre menu fermé (AC1)', async () => {
    const { user } = await ouvrir();
    await waitFor(() => expect(pageVerrouillee(), 'verrou posé menu ouvert').toBe(true));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(pageVerrouillee(), 'verrou levé menu fermé').toBe(false));
  });

  it('Tab et Maj+Tab ne font jamais sortir le focus du panneau (AC3)', async () => {
    const { user, panneau } = await ouvrir();
    const cibles = [...panneau.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
    expect(cibles.length).toBeGreaterThan(3);
    cibles[0]!.focus();
    // Deux tours complets dans chaque sens : le piège doit boucler, pas seulement retenir.
    // Les gardes de focus de base-ui sont des `<span tabindex=0>` HORS du panneau, qui
    // renvoient le focus dedans à leur `focus` : on attend ce renvoi, comme le navigateur le fait.
    for (let i = 0; i < cibles.length * 2; i++) {
      await user.tab();
      await waitFor(() => expect(panneau.contains(document.activeElement), `Tab n°${i + 1} : ${document.activeElement?.outerHTML.slice(0, 80)}`).toBe(true));
    }
    for (let i = 0; i < cibles.length * 2; i++) {
      await user.tab({ shift: true });
      await waitFor(() => expect(panneau.contains(document.activeElement), `Maj+Tab n°${i + 1}`).toBe(true));
    }
  });
});

/**
 * Mesuré au navigateur pendant ce ticket : menu ouvert à 800 px, puis la fenêtre passée à 1280
 * (une tablette qu'on fait pivoter) — le panneau `lg:hidden` disparaît, mais la MODALE reste :
 * `body` verrouillé, cinq enfants de `body` en `aria-hidden`. Le menu se ferme donc au passage
 * de `lg`.
 */
describe('Menu mobile — passer en mise en page de bureau le referme', () => {
  it('au franchissement de `lg` (64rem), le menu ouvert se ferme et la page est déverrouillée', async () => {
    const ecouteurs = new Set<(e: { matches: boolean }) => void>();
    const origine = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_: string, f: (e: { matches: boolean }) => void) => { if (query.includes('64rem')) ecouteurs.add(f); },
      removeEventListener: (_: string, f: (e: { matches: boolean }) => void) => { ecouteurs.delete(f); },
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    try {
      await ouvrir();
      expect(ecouteurs.size, 'le menu ouvert écoute le seuil `lg`').toBeGreaterThan(0);
      React.act(() => ecouteurs.forEach((f) => f({ matches: true })));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull());
      await waitFor(() => expect(pageVerrouillee()).toBe(false));
    } finally {
      window.matchMedia = origine;
    }
  });
});

describe('Menu mobile — un menu de NAVIGATION (TCK-551, N6)', () => {
  it('ne porte plus la rangée de catégories : le tiroir de filtres les porte toutes', async () => {
    const { panneau } = await ouvrir();
    for (const nom of ['Appartement', 'Maison', 'Villa', 'Terrain', 'Commerce', 'Bureau']) {
      expect(within(panneau).queryByRole('button', { name: nom }), nom).toBeNull();
    }
    expect(panneau.querySelector('.overflow-x-auto')).toBeNull();
    // La navigation, elle, reste.
    expect(within(panneau).getByRole('link', { name: 'Acheter' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('Menu mobile — alignements (TCK-551, N7)', () => {
  it('la barre prend la gouttière du contenu sous `lg` (`px-4`) et garde `px-6` au-delà', () => {
    const { container } = monter();
    const barre = container.querySelector('nav > div');
    expect(classesDe(barre)).toContain('px-4');
    expect(classesDe(barre)).toContain('lg:px-6');
    expect(classesDe(barre)).not.toContain('px-6');
  });

  it('l’en-tête et les blocs du panneau prennent la même gouttière que la barre (`px-4`)', async () => {
    const { panneau } = await ouvrir();
    const entete = panneau.firstElementChild!;
    const defilant = panneau.querySelector('.overflow-y-auto')!;
    // Les blocs : l'en-tête, puis chaque enfant de la zone qui défile (liens, langue, compte).
    const blocs = [entete, ...defilant.children];
    expect(blocs.length).toBeGreaterThanOrEqual(4);
    for (const bloc of blocs) {
      expect(classesDe(bloc), bloc.outerHTML.slice(0, 100)).toContain('px-4');
      expect(classesDe(bloc)).not.toContain('px-6');
    }
  });

  it('« Connexion » : la classe `px-0` de l’appelant REMPLACE `px-2.5` de la variante (fusion)', async () => {
    const { panneau } = await ouvrir();
    const connexion = within(panneau).getByRole('link', { name: 'Connexion' });
    expect(classesDe(connexion)).toContain('px-0');
    expect(classesDe(connexion)).not.toContain('px-2.5');
  });
});

describe('Barre mobile — « Mes favoris » (TCK-551, N8)', () => {
  it('sa zone tactile fait 44 px (`ZONE_TACTILE_44`) sans que son dessin change', () => {
    monter();
    const favoris = screen.getAllByRole('button', { name: 'Mes favoris' }).find((b) => classesDe(b).includes('p-2'));
    expect(favoris, 'le bouton compact de la barre mobile').toBeDefined();
    expect(classesDe(favoris!)).toEqual(expect.arrayContaining(['relative', 'before:absolute', 'before:size-11']));
    // Le dessin : le même rond de 36 px (`p-2` + icône de 20 px), pas un rond agrandi.
    expect(classesDe(favoris!)).not.toContain('size-11');
  });
});
