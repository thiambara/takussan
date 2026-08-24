import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useScrollRestoration } from '../useScrollRestoration';

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
});
