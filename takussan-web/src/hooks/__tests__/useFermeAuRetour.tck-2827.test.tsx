import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFermeAuRetour } from '../useFermeAuRetour';

/**
 * TCK-2827 — l'AppRouter de Next 16 réécrit `history.state` (`replaceState`, même URL) à chaque rendu
 * du routeur (`router.refresh()`) sans recopier les clés qu'il ne connaît pas : la marque de la
 * sentinelle disparaît. Fermée par ✕ ensuite, la surface doit quand même rendre sa sentinelle.
 */
const reecritureParLeRouteur = () =>
  window.history.replaceState({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ['x'] }, '', window.location.href);

const attendreUnPopstate = () =>
  new Promise<void>((resoudre) => window.addEventListener('popstate', () => resoudre(), { once: true }));

let longueurAvant: number;

beforeEach(() => {
  window.history.replaceState({ __NA: true }, '', '/app/agency/finances?tab=impayes');
  longueurAvant = window.history.length;
});

afterEach(() => {
  vi.useRealTimers();
});

const monter = () => {
  const fermer = vi.fn();
  const rendu = renderHook(({ ouverte }) => useFermeAuRetour(ouverte, fermer), { initialProps: { ouverte: false } });
  return { fermer, rendu };
};

describe('useFermeAuRetour — la sentinelle survit à une réécriture de l’état par le routeur (TCK-2827)', () => {
  it('témoin : ouvrir puis ✕ rend la sentinelle (un `back()`)', async () => {
    const { rendu } = monter();
    rendu.rerender({ ouverte: true });
    expect(window.history.length).toBe(longueurAvant + 1);
    const retour = vi.spyOn(window.history, 'back');
    const pop = attendreUnPopstate();
    rendu.rerender({ ouverte: false });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(retour).toHaveBeenCalledTimes(1);
    await pop;
    retour.mockRestore();
  });

  it('ouvrir, réécriture de l’état par le routeur, ✕ : la sentinelle est rendue quand même', async () => {
    const { rendu } = monter();
    rendu.rerender({ ouverte: true });
    reecritureParLeRouteur();
    expect((window.history.state as Record<string, unknown>).__takussanFermeAuRetour).toBeUndefined();
    const retour = vi.spyOn(window.history, 'back');
    const pop = attendreUnPopstate();
    rendu.rerender({ ouverte: false });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(retour).toHaveBeenCalledTimes(1);
    await pop;
    expect(window.location.pathname + window.location.search).toBe('/app/agency/finances?tab=impayes');
    retour.mockRestore();
  });

  it('après la réécriture, un ré-montage de l’effet n’empile pas une seconde sentinelle', () => {
    const { rendu } = monter();
    rendu.rerender({ ouverte: true });
    const longueurOuverte = window.history.length;
    reecritureParLeRouteur();
    // Fermer puis rouvrir dans la même tâche : le retour différé est annulé, l'entrée reste la nôtre.
    rendu.rerender({ ouverte: false });
    rendu.rerender({ ouverte: true });
    expect(window.history.length).toBe(longueurOuverte);
  });

  it('une navigation empilée depuis (autre entrée) n’est pas défaite par la fermeture', async () => {
    const { rendu } = monter();
    rendu.rerender({ ouverte: true });
    window.history.pushState({ __NA: true }, '', '/app/leases/12');
    const retour = vi.spyOn(window.history, 'back');
    rendu.rerender({ ouverte: false });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(retour).not.toHaveBeenCalled();
    retour.mockRestore();
  });

  it('une navigation empilée À LA MÊME ADRESSE n’est pas défaite non plus (la pile a bougé)', async () => {
    const { rendu } = monter();
    rendu.rerender({ ouverte: true });
    window.history.pushState({ __NA: true }, '', window.location.href);
    const retour = vi.spyOn(window.history, 'back');
    rendu.rerender({ ouverte: false });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(retour).not.toHaveBeenCalled();
    retour.mockRestore();
  });

  it('une navigation qui REMPLACE l’entrée par une autre adresse n’est pas défaite non plus', async () => {
    const { rendu } = monter();
    rendu.rerender({ ouverte: true });
    window.history.replaceState({ __NA: true }, '', '/app/leases/12');
    const retour = vi.spyOn(window.history, 'back');
    rendu.rerender({ ouverte: false });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(retour).not.toHaveBeenCalled();
    retour.mockRestore();
  });

  it('le geste retour ferme la surface (popstate), sans second `back()`', async () => {
    const { fermer, rendu } = monter();
    rendu.rerender({ ouverte: true });
    reecritureParLeRouteur();
    const pop = attendreUnPopstate();
    window.history.back();
    await pop;
    expect(fermer).toHaveBeenCalledTimes(1);
    const retour = vi.spyOn(window.history, 'back');
    rendu.rerender({ ouverte: false });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(retour).not.toHaveBeenCalled();
    retour.mockRestore();
  });
});
