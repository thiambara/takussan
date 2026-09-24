/**
 * TCK-569 (M4, retour testeur du 2026-09-23) — « Liste décalée » : le panneau des favoris de la
 * barre mobile débordait à gauche de l'écran, titre et « Voir tous mes favoris » coupés.
 *
 * Mesuré au navigateur (Chrome, émulation mobile) AVANT le correctif : un panneau de 320 px aligné
 * sur le bord droit du cœur commençait à x = −68 à 320 px (la largeur CSS de l'iPhone du testeur,
 * en zoom d'affichage), −28 à 360, +2 à 390. APRÈS : 16 px de chaque bord aux trois largeurs, et
 * 711..1095 à 1366 px, comme avant.
 *
 * jsdom ne fait pas de mise en page, mais le positionneur de base-ui (floating-ui) CALCULE la
 * position à partir des rectangles qu'on lui donne. On lui donne ceux du navigateur — le cœur là
 * où la barre mobile le pose, le panneau de 320 px (384 px en bureau) — et on lit la translation
 * qu'il écrit. C'est ce calcul, et non une classe, que le test éprouve.
 *
 * Ablation : ancien panneau (`absolute right-0 w-80`) → aucun positionneur, les quatre tests
 * rougissent (le test bureau pour une raison mécanique — pas de translation à lire — : c'est une
 * garde, le bureau était juste ; Échap, lui, ne fermait réellement rien) ; `collisionPadding`
 * retiré du panneau, ou non transmis par `ui/popover.tsx` → le panneau se recale à 5 px (défaut
 * de base-ui) et les deux tests mobiles rougissent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { FavoritesPopover } from '../FavoritesPopover';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/fr',
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, token: null, isLoading: false }),
}));

vi.mock('@/lib/queries/favorites', () => ({
  usePropertiesByIdsQuery: () => ({
    data: { data: [], meta: { requested_ids: [624, 678], returned_ids: [624, 678] } },
    isLoading: false,
  }),
  useRemoveFavoriteMutation: () => ({ mutate: vi.fn() }),
}));

/** Le positionneur mesure l'élément qui PORTE la fenêtre, pas la fenêtre elle-même. */
const portePanneau = (el: Element) =>
  el.matches('[data-slot=popover-content]') ||
  !!el.querySelector(':scope > [data-slot=popover-content]');

/**
 * Pose l'écran et les rectangles relevés au navigateur : largeur de l'écran, cœur à `coeurGauche`
 * (36 × 36, sous la barre à y = 8), panneau de `largeurPanneau` × 300.
 */
function geometrie(ecran: number, coeurGauche: number, largeurPanneau: number) {
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: ecran });
  Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 740 });
  const rectOrigine = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.matches('button[aria-haspopup]')) return new DOMRect(coeurGauche, 8, 36, 36);
    if (portePanneau(this)) return new DOMRect(0, 0, largeurPanneau, 300);
    return rectOrigine.call(this);
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return portePanneau(this) ? largeurPanneau : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return portePanneau(this) ? 300 : 0;
  });
}

/** Bord gauche du panneau tel que le positionneur l'a écrit (`transform: translate(x, y)`), ou null. */
function bordGauche(panneau: HTMLElement): number | null {
  const porteur = panneau.parentElement;
  const m = /translate\((-?[\d.]+)px/.exec(porteur?.style.transform ?? '');
  return m ? Number(m[1]) : null;
}

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <FavoritesPopover variant="compact" />
      </QueryClientProvider>,
    ),
  );
}

async function ouvrir() {
  await userEvent.setup().click(screen.getByRole('button', { name: /favoris/i }));
  return screen.findByRole('dialog', { name: 'Mes favoris' });
}

describe('<FavoritesPopover> — le panneau reste dans l’écran (TCK-569, M4)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('takussan.favorites', JSON.stringify([624, 678]));
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('à 360 px, le panneau aligné sur le cœur (x = −28) est recalé à la gouttière de 16 px', async () => {
    geometrie(360, 256, 320);
    rendre();
    const panneau = await ouvrir();

    await waitFor(() => expect(bordGauche(panneau)).toBe(16));
  });

  it('à 320 px (largeur de la capture), le panneau part lui aussi de la gouttière', async () => {
    geometrie(320, 216, 320);
    rendre();
    const panneau = await ouvrir();

    await waitFor(() => expect(bordGauche(panneau)).toBe(16));
  });

  it('en bureau, rien ne bouge : bord droit du panneau sur celui du cœur (711 à 1366 px)', async () => {
    geometrie(1366, 1059, 384);
    rendre();
    const panneau = await ouvrir();

    await waitFor(() => expect(bordGauche(panneau)).toBe(711));
  });

  it('Échap ferme le panneau et rend le focus au cœur', async () => {
    const utilisateur = userEvent.setup();
    rendre();
    const coeur = screen.getByRole('button', { name: /favoris/i });

    await utilisateur.click(coeur);
    await screen.findByRole('dialog', { name: 'Mes favoris' });
    expect(coeur).toHaveAttribute('aria-expanded', 'true');

    await utilisateur.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Mes favoris' })).toBeNull());
    expect(coeur).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(coeur).toHaveFocus());
  });
});
