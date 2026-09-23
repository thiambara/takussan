import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useScrollRestoration } from '../useScrollRestoration';
import { useVerrouDeDefilement } from '../useVerrouDeDefilement';

/**
 * TCK-335, étape 4 — la position de défilement est mémorisée PAR ENTRÉE D'HISTORIQUE.
 *
 * Ce que ces deux cas prouvent, et rien d'autre :
 *   1. une position mémorisée sous une clé d'historique est réappliquée au montage
 *      suivant qui porte LA MÊME clé, et seulement APRÈS le commit des résultats ;
 *   2. elle ne l'est PAS sous une clé différente — sans quoi on restaurerait la
 *      position d'une autre recherche sur la même URL de page.
 *
 * Ils ne prouvent rien sur l'écrêtage réel du navigateur (jsdom n'a pas de mise en
 * page) : c'est le rôle du signal `pret`, mesuré au navigateur, pas ici.
 */

const URL_RECHERCHE = '/properties?city=Dakar&bedrooms=3';

function poserEntree(cle: string, url = URL_RECHERCHE) {
  window.history.replaceState({ key: cle }, '', url);
}

function poserDefilement(y: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
}

/** Monte le hook, ouvre l'enregistrement, défile jusqu'à `y`, démonte. */
function memoriserUnDefilement(cle: string, y: number) {
  poserEntree(cle);
  poserDefilement(0);
  const { unmount } = renderHook(() => useScrollRestoration(true));
  poserDefilement(y);
  act(() => {
    window.dispatchEvent(new Event('scroll'));
  });
  unmount();
}

describe('useScrollRestoration', () => {
  let scrollTo: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.sessionStorage.clear();
    // rAF synchrone : le hook coalesce l'enregistrement et rejoue la restauration à la
    // frame suivante. Sans cette bascule, le test devrait attendre un vrai timer de 16 ms.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    scrollTo.mockRestore();
  });

  it('réapplique la position mémorisée sur la MÊME entrée d’historique, après le commit des résultats', () => {
    memoriserUnDefilement('entree-A', 1200);

    poserEntree('entree-A');
    poserDefilement(0);
    scrollTo.mockClear();

    const { rerender } = renderHook(({ pret }) => useScrollRestoration(pret), {
      initialProps: { pret: false },
    });

    // Tant que la page rend ses squelettes, on ne touche pas au défilement : c'est
    // exactement l'erreur de la restauration native, qui écrête 1 200 px à 0.
    expect(scrollTo).not.toHaveBeenCalled();

    rerender({ pret: true });

    expect(scrollTo).toHaveBeenCalledWith(0, 1200);
  });

  it('n’applique RIEN sur une entrée d’historique différente, à URL identique', () => {
    memoriserUnDefilement('entree-A', 1200);

    poserEntree('entree-B');
    poserDefilement(0);
    scrollTo.mockClear();

    const { rerender } = renderHook(({ pret }) => useScrollRestoration(pret), {
      initialProps: { pret: false },
    });
    rerender({ pret: true });

    expect(scrollTo).not.toHaveBeenCalled();
  });

  /**
   * TCK-557 · AC5 — mesuré au navigateur le 2026-09-23 : le routeur de Next 16 ne reconduit PAS
   * l'état personnalisé sur une navigation (`router.push`). L'entrée poussée arrive SANS clé, si
   * bien que la page 2 atteinte par la pagination n'enregistrait rien, et que le retour depuis une
   * fiche repartait de 0. La double ci-dessous rejoue exactement ce que Next écrit.
   */
  it('une entrée poussée SANS état reçoit sa propre clé, et le retour sur elle restaure', () => {
    poserEntree('entree-A');
    poserDefilement(0);
    const page = renderHook(({ pret }) => useScrollRestoration(pret), {
      initialProps: { pret: true },
    });
    poserDefilement(4000);
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    // `router.push` de Next : un état neuf, sans rien de ce que la page y avait posé.
    window.history.pushState({ __NA: true }, '', '/properties?city=Dakar&bedrooms=3&page=2');
    page.rerender({ pret: false });
    // Le défilement vers les résultats, pendant le chargement : il ne concerne PAS l'entrée A.
    poserDefilement(319);
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    page.rerender({ pret: true });
    poserDefilement(1500);
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    page.unmount(); // ouverture d'une fiche

    // Retour arrière : l'entrée de la page 2 est de nouveau courante, avec l'état qu'on y a posé.
    poserDefilement(0);
    scrollTo.mockClear();
    const retour = renderHook(({ pret }) => useScrollRestoration(pret), {
      initialProps: { pret: false },
    });
    retour.rerender({ pret: true });
    expect(scrollTo).toHaveBeenCalledWith(0, 1500);
    retour.unmount();

    // Et l'entrée A n'a pas été écrasée par ce qui s'est passé sur la page 2.
    poserEntree('entree-A');
    scrollTo.mockClear();
    const pageA = renderHook(({ pret }) => useScrollRestoration(pret), {
      initialProps: { pret: false },
    });
    pageA.rerender({ pret: true });
    expect(scrollTo).toHaveBeenCalledWith(0, 4000);
    pageA.unmount();
  });
});

/**
 * TCK-551, tour 3 — régression mesurée par le vérificateur adverse sur `/fr/properties` à
 * 390 × 844, défilée à 900 : ouvrir le menu mobile pose `body` en `position: fixed`, `scrollY`
 * tombe à 0, et l'événement `scroll` qui s'ensuit écrivait `{"y":0}` dans la mémoire de CE hook.
 * Toute sortie menu ouvert — geste retour d'Android, rechargement — perdait la position de la
 * liste (rendue à 0, contre 901 pour le témoin sans menu).
 *
 * Le verrou publie son décalage sur `body` ; l'enregistrement lit la position RÉELLE du
 * visiteur, pas le `scrollY` d'un document sorti du flux.
 */
describe('useScrollRestoration — sous le verrou du menu mobile (TCK-551)', () => {
  let scrollTo: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.sessionStorage.clear();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    scrollTo.mockRestore();
    document.body.removeAttribute('style');
    document.body.removeAttribute('data-verrou-defilement-y');
  });

  it('le `scroll` émis par la pose du verrou n’écrase pas la position par 0', () => {
    poserEntree('entree-menu');
    poserDefilement(0);
    const page = renderHook(() => useScrollRestoration(true));
    poserDefilement(900);
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    // Ouverture du menu : le verrou sort `body` du flux, le navigateur ramène `scrollY` à 0 et
    // émet un `scroll` — exactement ce que Chrome fait, mesuré.
    const verrou = renderHook(() => useVerrouDeDefilement(true));
    poserDefilement(0);
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    // Sortie menu ouvert (geste retour, rechargement) : la page se démonte SANS lever le verrou.
    page.unmount();
    verrou.unmount();

    poserEntree('entree-menu');
    poserDefilement(0);
    scrollTo.mockClear();
    const retour = renderHook(({ pret }) => useScrollRestoration(pret), {
      initialProps: { pret: false },
    });
    retour.rerender({ pret: true });
    expect(scrollTo).toHaveBeenCalledWith(0, 900);
    retour.unmount();
  });
});
