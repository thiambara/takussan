import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { CompteurDeVue } from '@/app/[locale]/(public)/properties/[slug]/components/CompteurDeVue';
import { marquerArriveeSponsorisee } from '../arrivee-sponsorisee';

/**
 * TCK-633 lot F (ADR-0061 §10, collision C7) — une vue de fiche arrivée par un emplacement
 * « Sponsorisé » part avec `?src=sponsored`, UNE fois : la vue suivante du même bien est organique.
 */
let fetchSpy: MockInstance<typeof fetch>;

beforeEach(() => {
  sessionStorage.clear();
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CompteurDeVue — arrivée par un emplacement (TCK-633 lot F)', () => {
  it('ajoute `src=sponsored` à la vue arrivée par un emplacement, puis plus rien', () => {
    marquerArriveeSponsorisee('villa-saly');

    const { unmount } = render(<CompteurDeVue slug="villa-saly" />);
    unmount();
    render(<CompteurDeVue slug="villa-saly" />);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[0]![0])).toMatch(/\/public\/properties\/villa-saly\/view\?src=sponsored$/);
    expect(String(fetchSpy.mock.calls[1]![0])).toMatch(/\/public\/properties\/villa-saly\/view$/);
  });

  it('l’arrivée notée pour un AUTRE bien ne marque pas celui-ci', () => {
    marquerArriveeSponsorisee('autre-bien');

    render(<CompteurDeVue slug="villa-saly" />);

    expect(String(fetchSpy.mock.calls[0]![0])).toMatch(/\/view$/);
  });
});
