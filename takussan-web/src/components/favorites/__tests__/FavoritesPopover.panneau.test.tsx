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
 * La largeur maximale que la classe `max-w-[calc(100vw-<n>rem)]` du panneau impose à un écran de
 * `ecran` px, ou `Infinity` sans elle. jsdom n'applique aucune feuille de style : on résout la
 * classe à la main, comme `Navbar.pastille-etroite.test.tsx` résout ses requêtes de conteneur.
 * (Préfixe découpé : Tailwind scanne aussi les tests.)
 */
function largeurMaxDeLaClasse(el: Element, ecran: number): number {
  const prefixe = 'max-w-' + '[calc(100vw-';
  for (const classe of el.className.split(/\s+/)) {
    if (!classe.startsWith(prefixe) || !classe.endsWith('rem)]')) continue;
    return ecran - Number(classe.slice(prefixe.length, -'rem)]'.length)) * 16;
  }
  return Infinity;
}

/** Le panneau lui-même, qu'on interroge sur lui ou sur son porteur. */
const panneauDe = (el: Element) =>
  el.matches('[data-slot=popover-content]') ? el : el.querySelector(':scope > [data-slot=popover-content]');

/**
 * Pose l'écran et les rectangles relevés au navigateur : largeur de l'écran, cœur à `coeurGauche`
 * (36 × 36, sous la barre à y = 8), panneau de `largeurPanneau` × 300 — plafonné par son `max-w`,
 * comme le navigateur le ferait.
 */
function geometrie(ecran: number, coeurGauche: number, largeurPanneau: number) {
  const largeur = (el: Element) => Math.min(largeurPanneau, largeurMaxDeLaClasse(panneauDe(el)!, ecran));
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: ecran });
  Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 740 });
  const rectOrigine = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.matches('button[aria-haspopup]')) return new DOMRect(coeurGauche, 8, 36, 36);
    if (portePanneau(this)) return new DOMRect(0, 0, largeur(this), 300);
    return rectOrigine.call(this);
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return portePanneau(this) ? largeur(this) : 0;
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

  /**
   * Solde de TCK-569 (vérification du 2026-09-23) : retirer le `max-w` laissait les quatre tests
   * verts — la géométrie simulée donnait au panneau 320 px quoi qu'il arrive. Or à 320 px, un
   * panneau de 320 px recalé à 16 px à gauche finit à 336 : il déborde à droite. Le navigateur
   * mesure 16..304 (288 px) avec la classe ; la simulation applique désormais le plafond.
   */
  it('à 320 px, le panneau ne déborde pas non plus à DROITE : 16 px de chaque bord', async () => {
    geometrie(320, 216, 320);
    rendre();
    const panneau = await ouvrir();

    await waitFor(() => expect(bordGauche(panneau)).toBe(16));
    const largeur = Math.min(320, largeurMaxDeLaClasse(panneau, 320));
    expect(bordGauche(panneau)! + largeur).toBeLessThanOrEqual(320 - 16);
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

  /**
   * Solde de TCK-569 (vérification du 2026-09-23, confirmé le 2026-09-24) : à 320 px, l'appui « à
   * côté » qui fermait le panneau tombait AUSSI sur la carte dessous et ouvrait sa fiche (`/fr` →
   * `/fr/properties/parking-couvert-a-pikine-UjterU`). Le voile reçoit cet appui : le panneau se
   * ferme, rien d'autre. jsdom ne fait pas de test d'impact (`elementFromPoint`) : on garde ce qui
   * le rend possible — un voile plein écran au-dessus du contenu (lien étiré des cartes :
   * `z-[1]`), sous le panneau (`z-[1100]`) — puis l'effet d'un appui sur lui.
   */
  it('un appui à côté ferme le panneau et n’active rien dessous', async () => {
    const dessous = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      withIntl(
        <QueryClientProvider client={client}>
          <button type="button" onClick={dessous}>carte</button>
          <FavoritesPopover variant="compact" />
        </QueryClientProvider>,
      ),
    );
    await ouvrir();

    const voile = document.querySelector<HTMLElement>('[data-slot=popover-voile]');
    expect(voile).not.toBeNull();
    const classes = voile!.className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(['fixed', 'inset-0']));
    const plan = (c: string[]) => Number(c.find((x) => x.startsWith('z-['))?.slice(3, -1));
    expect(plan(classes)).toBeGreaterThan(1);
    expect(plan(classes)).toBeLessThan(plan(voile!.nextElementSibling!.className.split(/\s+/)));

    await userEvent.setup().click(voile!);

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Mes favoris' })).toBeNull());
    expect(dessous).not.toHaveBeenCalled();
  });
});
