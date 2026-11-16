import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import {
  DELAI_DU_LOT_MS,
  observerLesEmplacements,
  reinitialiserLesDeclarations,
} from '@/components/boost/impressions-affichees';

/**
 * TCK-2569 — la déclaration groupée des emplacements affichés : seul un élément AFFICHÉ (la moitié
 * dans l'écran) déclare, une fois par bien et par document, en un lot de formulaire sans identifiants.
 */

type Rappel = IntersectionObserverCallback;
let rappels: Rappel[] = [];

class ObservateurPilote {
  constructor(rappel: Rappel) {
    rappels.push(rappel);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

function voir(element: Element, ratio: number) {
  for (const rappel of rappels) {
    rappel([{ target: element, isIntersecting: ratio > 0, intersectionRatio: ratio } as IntersectionObserverEntry], {} as IntersectionObserver);
  }
}

let fetchSpy: MockInstance<typeof fetch>;

beforeEach(() => {
  vi.useFakeTimers();
  rappels = [];
  reinitialiserLesDeclarations();
  vi.stubGlobal('IntersectionObserver', ObservateurPilote);
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('impressions-affichees (TCK-2569)', () => {
  it('ne déclare qu’un emplacement affiché à moitié, en un lot, une seule fois par bien', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    const c = document.createElement('div');
    const debrancher = observerLesEmplacements([[a, 'bien-a'], [b, 'bien-b'], [c, 'bien-c']]);

    voir(a, 1);
    voir(b, 0.2); // à peine entré dans l'écran : pas affiché
    voir(a, 1); // déjà déclaré
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(DELAI_DU_LOT_MS);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/public\/properties\/sponsored-impressions$/);
    expect(init).toMatchObject({ method: 'POST', keepalive: true, credentials: 'omit' });
    expect((init!.body as URLSearchParams).getAll('slugs[]')).toEqual(['bien-a']);

    voir(c, 0.6);
    observerLesEmplacements([[a, 'bien-a']]);
    voir(a, 1); // une autre cellule du même bien : déjà déclaré dans ce document
    vi.advanceTimersByTime(DELAI_DU_LOT_MS);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect((fetchSpy.mock.calls[1]![1]!.body as URLSearchParams).getAll('slugs[]')).toEqual(['bien-c']);
    debrancher();
  });

  it('le lot part sans attendre quand la page se ferme', () => {
    const a = document.createElement('div');
    observerLesEmplacements([[a, 'bien-a']]);
    voir(a, 1);
    window.dispatchEvent(new Event('pagehide'));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('rien n’est envoyé sans emplacement affiché, et un fetch qui échoue ne lève pas', async () => {
    fetchSpy.mockRejectedValue(new Error('hors ligne'));
    const a = document.createElement('div');
    observerLesEmplacements([[a, 'bien-a']]);
    vi.advanceTimersByTime(DELAI_DU_LOT_MS * 2);
    expect(fetchSpy).not.toHaveBeenCalled();

    voir(a, 1);
    vi.advanceTimersByTime(DELAI_DU_LOT_MS);
    await vi.runAllTimersAsync();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
