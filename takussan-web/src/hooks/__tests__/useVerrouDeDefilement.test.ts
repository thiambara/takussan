/**
 * TCK-551, tour 2 — le verrou de défilement du menu mobile.
 *
 * Mesuré au navigateur (Chrome, `mobile: true`, 390 × 844) sur le verrou de base-ui : menu
 * ouvert, `window.scrollBy(0, 500)` faisait passer `scrollY` de 700 à 1200. Sur tout appareil à
 * barres de défilement superposées — tous les mobiles, iOS compris —, base-ui ne pose que
 * `overflow: hidden` (`@base-ui/utils/useScrollLock.mjs` l. 50-71, l. 247), qui n'arrête ni un
 * défilement programmatique, ni, de l'aveu de son propre commentaire (l. 249-254), Safari iOS
 * barre d'adresse repliée.
 *
 * Ce verrou-ci sort le document du flux : `body` en `position: fixed`, décalé de la position de
 * défilement pour que rien ne bouge à l'écran. Le document n'a plus de hauteur à faire défiler,
 * quel que soit celui qui le demande. À la levée, la position est rendue — sans animation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';

import { useVerrouDeDefilement } from '@/hooks/useVerrouDeDefilement';

let scrollTo: ReturnType<typeof vi.fn>;

function defiler(x: number, y: number) {
  Object.defineProperty(window, 'scrollX', { configurable: true, value: x });
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
}

beforeEach(() => {
  scrollTo = vi.fn();
  vi.stubGlobal('scrollTo', scrollTo);
  defiler(0, 700);
});

afterEach(() => {
  // Démonter AVANT de rendre le vrai `scrollTo` (que jsdom n'implémente pas).
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('style');
  document.body.removeAttribute('style');
});

describe('useVerrouDeDefilement', () => {
  it('inactif, ne touche à rien', () => {
    renderHook(() => useVerrouDeDefilement(false));
    expect(document.body.getAttribute('style')).toBeNull();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('actif, sort `body` du flux à la position courante : rien ne bouge à l’écran', () => {
    renderHook(() => useVerrouDeDefilement(true));
    const s = document.body.style;
    expect(s.position).toBe('fixed');
    expect(s.top).toBe('-700px');
    expect(s.left).toBe('0px');
    expect(s.width).toBe('100%');
  });

  it('levé, rend les styles d’origine de `body` et la position de défilement, sans animation', () => {
    document.body.style.color = 'red';
    document.body.style.top = '3px';
    document.documentElement.style.scrollBehavior = 'smooth';
    const { rerender } = renderHook(({ actif }) => useVerrouDeDefilement(actif), {
      initialProps: { actif: true },
    });
    // Pendant le verrou, la page est à 0 pour le navigateur : c'est `top` qui porte les 700 px.
    defiler(0, 0);
    rerender({ actif: false });

    expect(document.body.style.position).toBe('');
    expect(document.body.style.top).toBe('3px');
    expect(document.body.style.color).toBe('red');
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ left: 0, top: 700, behavior: 'instant' });
    // `scroll-behavior: smooth` aurait fait glisser la page de 0 à 700 sous les yeux du visiteur.
    expect(document.documentElement.style.scrollBehavior).toBe('smooth');
  });

  it('démonté verrou posé (changement de langue, navigation), il lève le verrou', () => {
    const { unmount } = renderHook(() => useVerrouDeDefilement(true));
    unmount();
    expect(document.body.style.position).toBe('');
    expect(scrollTo).toHaveBeenCalledWith({ left: 0, top: 700, behavior: 'instant' });
  });

  it('rend aussi le défilement horizontal', () => {
    defiler(40, 120);
    const { unmount } = renderHook(() => useVerrouDeDefilement(true));
    expect(document.body.style.top).toBe('-120px');
    expect(document.body.style.left).toBe('-40px');
    unmount();
    expect(scrollTo).toHaveBeenCalledWith({ left: 40, top: 120, behavior: 'instant' });
  });
});
