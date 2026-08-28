import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

/**
 * TCK-432 · AC5 (accueil) — **les rangées semées par le serveur ne repartent pas en squelette.**
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA PROPRIÉTÉ ÉPROUVÉE, ET POURQUOI ELLE EST FORMULÉE AINSI
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `PropertyRow` affiche son squelette sur `loading`. La propriété est donc : **sur un montage semé,
 * `loading` ne vaut jamais `true`.** « Les rangées finissent par arriver » serait vert sur le code
 * d'avant TCK-432 — c'est ce que faisait déjà l'effet.
 *
 * S'y ajoute la règle de personnalisation, qui est le cœur du piège nommé par le ticket : *« le
 * rendu serveur ne peut pas attendre un fournisseur tiers ; la forme retenue doit rendre un contenu
 * honnête sans ville, puis laisser la personnalisation arriver »*. Traduit en code, cela fait deux
 * obligations opposées, que ces cas séparent :
 *
 * · **sans ville devinée, aucune relance** — le serveur a déjà demandé exactement cela, et
 *   redemander coûterait un aller-retour pour réafficher la même chose ;
 * · **avec une ville devinée, une relance** — sinon la personnalisation n'arrive jamais, et le
 *   provider géographique ne sert plus à rien.
 */

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import { useHomepageDiscovery } from '../useHomepageDiscovery';
import type { HomepageDiscoveryData, PropertyListItem } from '@/types/property';

const bien = (id: number) => ({ id, slug: `bien-${id}`, title: `Bien ${id}` }) as PropertyListItem;

const rangees = (id: number, ville = 'Dakar'): HomepageDiscoveryData => ({
  near: { items: [bien(id)], city: ville, requested_city: null, fallback: false },
  rent: { items: [bien(id + 1)] },
  featured: { items: [bien(id + 2)] },
  latest: { items: [bien(id + 3)] },
});

const SEMEES = rangees(1);
const RELANCE = rangees(100, 'Saly');

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue({ data: RELANCE, meta: { per_row: 12 } });
});

describe('TCK-432 · AC5 — l’accueil semé est complet dès le premier commit', () => {
  it('rend les rangées du serveur sans jamais passer par `loading`', () => {
    const { result } = renderHook(() =>
      useHomepageDiscovery({ donneesInitiales: SEMEES, enabled: true }),
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.rows?.near.items[0].id).toBe(1);
    expect(result.current.failed).toBe(false);
  });

  it('ne relance RIEN quand aucune ville n’a été devinée — le serveur a déjà demandé cela', async () => {
    renderHook(() => useHomepageDiscovery({ donneesInitiales: SEMEES, enabled: true }));

    await waitFor(() => expect(mockApiFetch).not.toHaveBeenCalled());
  });
});

describe('TCK-432 — la personnalisation arrive, et elle arrive SANS squelette', () => {
  it('relance avec `near_city` dès qu’une ville est devinée', async () => {
    const { result } = renderHook(() =>
      useHomepageDiscovery({ donneesInitiales: SEMEES, nearCity: 'Saly', enabled: true }),
    );

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    expect(String(mockApiFetch.mock.calls[0][0])).toContain('near_city=Saly');
    await waitFor(() => expect(result.current.rows?.near.city).toBe('Saly'));
  });

  it('garde les rangées semées à l’écran PENDANT la relance', async () => {
    // ⚠ C'est la moitié de l'AC5 que « la relance a lieu » ne dit pas : la relance ne doit pas
    // vider l'écran. On la laisse en suspens, et on regarde ce que le hook affiche.
    let resoudre: ((v: unknown) => void) | undefined;
    mockApiFetch.mockImplementation(() => new Promise((r) => { resoudre = r; }));

    const { result } = renderHook(() =>
      useHomepageDiscovery({ donneesInitiales: SEMEES, nearCity: 'Saly', enabled: true }),
    );

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    expect(result.current.loading).toBe(false);
    expect(result.current.rows?.near.items[0].id).toBe(1);

    resoudre?.({ data: RELANCE, meta: { per_row: 12 } });
    await waitFor(() => expect(result.current.rows?.near.items[0].id).toBe(100));
  });

  it('une ville devinée APRÈS coup relance aussi — la graine ne bloque pas le second passage', async () => {
    const { rerender } = renderHook(
      ({ ville }: { ville?: string }) =>
        useHomepageDiscovery({ donneesInitiales: SEMEES, nearCity: ville, enabled: true }),
      { initialProps: { ville: undefined as string | undefined } },
    );

    await waitFor(() => expect(mockApiFetch).not.toHaveBeenCalled());

    rerender({ ville: 'Saly' });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
  });
});

describe('TCK-432 — sans graine, rien ne change', () => {
  it('le hook garde son comportement d’avant : `loading` vrai, puis un appel', async () => {
    const { result } = renderHook(() => useHomepageDiscovery({ enabled: true }));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('une graine `null` (panne serveur) est traitée comme une absence de graine', async () => {
    const { result } = renderHook(() =>
      useHomepageDiscovery({ donneesInitiales: null, enabled: true }),
    );

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
  });
});
