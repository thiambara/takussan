/**
 * TCK-2600 (AC2) — quand le brouillon local part au stockage : 400 ms après la dernière frappe,
 * tout de suite quand l'onglet passe en arrière-plan ou se ferme, et au démontage. Une frappe ne
 * réécrit pas IndexedDB à chaque touche.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { moteurEnMemoire, ouvrirBrouillonLocal, type MoteurDeStockage } from '../brouillon-local';
import { useBrouillonLocal } from '../useBrouillonLocal';

afterEach(() => {
  vi.useRealTimers();
});

async function monter(moteur: MoteurDeStockage) {
  const rendu = renderHook(() => useBrouillonLocal<{ title?: string }>(() => ouvrirBrouillonLocal({ moteur })));
  await waitFor(() => expect(rendu.result.current.isLoading).toBe(false));
  return rendu;
}

/** Laisse les promesses de l'écriture se résoudre. */
const resoudre = () => act(async () => {
  await Promise.resolve();
  await Promise.resolve();
});

describe('useBrouillonLocal — le moment de l’écriture', () => {
  it('rien avant 400 ms, la dernière valeur après', async () => {
    const moteur = moteurEnMemoire();
    const { result } = await monter(moteur);
    vi.useFakeTimers();
    act(() => {
      result.current.save(1, { title: 'Stu' });
      result.current.save(1, { title: 'Studio' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(399);
    });
    expect(await moteur.lire('valeurs')).toBeUndefined();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await resoudre();
    expect((await moteur.lire('valeurs'))?.valeurs).toEqual({ title: 'Studio' });
  });

  it('l’onglet passe en arrière-plan : écrit tout de suite', async () => {
    const moteur = moteurEnMemoire();
    const { result } = await monter(moteur);
    act(() => result.current.save(2, { title: 'Studio' }));
    const visibilite = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await resoudre();
    visibilite.mockRestore();
    expect(await moteur.lire('valeurs')).toMatchObject({ etape: 2, valeurs: { title: 'Studio' } });
  });

  it('premier rendu sans stockage : « ce navigateur » comme au serveur (hydratation), puis la mémoire à l’ouverture', async () => {
    const { result } = renderHook(() => useBrouillonLocal(() => ouvrirBrouillonLocal({ moteur: null })));
    expect(result.current.stockage).toEqual({ persistance: 'navigateur', raison: null });
    await waitFor(() => expect(result.current.stockage).toEqual({ persistance: 'memoire', raison: 'refus' }));
  });

  it('le démontage écrit ce qui attend', async () => {
    const moteur = moteurEnMemoire();
    const { result, unmount } = await monter(moteur);
    act(() => result.current.save(3, { title: 'Studio' }));
    unmount();
    await resoudre();
    expect(await moteur.lire('valeurs')).toMatchObject({ etape: 3, valeurs: { title: 'Studio' } });
  });

  // L'assistant met `save` dans les dépendances de l'effet qui écrit l'étape : une fonction neuve à
  // chaque rendu y réécrivait les valeurs à chaque rendu — et remettait en brouillon, 400 ms après,
  // l'annonce que la publication venait d'effacer.
  it('save, flush, clear et ecrirePhotos gardent leur identité d’un rendu à l’autre', async () => {
    const { result, rerender } = await monter(moteurEnMemoire());
    const avant = result.current;
    act(() => result.current.save(1, { title: 'Studio' }));
    rerender();
    expect(result.current.save).toBe(avant.save);
    expect(result.current.flush).toBe(avant.flush);
    expect(result.current.clear).toBe(avant.clear);
    expect(result.current.ecrirePhotos).toBe(avant.ecrirePhotos);
  });
});
