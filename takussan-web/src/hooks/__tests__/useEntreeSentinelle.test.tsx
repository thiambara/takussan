/**
 * TCK-551, tour 4 — `useEntreeSentinelle`, isolé du menu.
 *
 * Le menu de la `Navbar` s'ouvre toujours APRÈS le montage (`menuOpen` part de `false`) : le
 * double montage de StrictMode n'y rejoue donc jamais l'effet « ouvert ». Le jeton qui l'en garde
 * ne se voit qu'ici, le hook monté déjà ouvert.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { MARQUE_MENU_MOBILE, useEntreeSentinelle } from '@/hooks/useEntreeSentinelle';

const uneTache = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));
let back: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  window.history.replaceState({ __NA: true }, '', '/fr/agents');
  back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
});

afterEach(() => {
  back.mockRestore();
});

describe('useEntreeSentinelle', () => {
  it('monté ouvert sous StrictMode (effet joué, défait, rejoué) : UNE sentinelle, aucun `back()`', async () => {
    const avant = window.history.length;
    renderHook(() => useEntreeSentinelle(true, () => {}), { wrapper: React.StrictMode });
    await uneTache();
    expect(window.history.length).toBe(avant + 1);
    expect(typeof (window.history.state as Record<string, unknown>)[MARQUE_MENU_MOBILE]).toBe('string');
    expect(back).not.toHaveBeenCalled();
  });

  it('fermé, il ne touche pas à l’historique', async () => {
    const avant = window.history.length;
    renderHook(() => useEntreeSentinelle(false, () => {}));
    await uneTache();
    expect(window.history.length).toBe(avant);
    expect(back).not.toHaveBeenCalled();
  });

  it('ne dépile QUE sa sentinelle : si quelqu’un a navigué entre-temps, pas de `back()`', async () => {
    const { rerender } = renderHook(({ ouvert }) => useEntreeSentinelle(ouvert, () => {}), {
      initialProps: { ouvert: true },
    });
    // Une navigation d'ailleurs a écrit l'entrée courante (état de Next, sans notre marque).
    window.history.replaceState({ __NA: true }, '', '/fr/agencies');
    rerender({ ouvert: false });
    await uneTache();
    expect(back).not.toHaveBeenCalled();
  });
});
