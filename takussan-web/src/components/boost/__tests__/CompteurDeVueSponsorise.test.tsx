import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { CompteurDeVue } from '@/app/[locale]/(public)/properties/[slug]/components/CompteurDeVue';

/**
 * TCK-633 lot F (ADR-0061 §10, collision C7) — une vue de fiche arrivée par un emplacement
 * « Sponsorisé » part avec `?src=sponsored`, UNE fois : la vue suivante du même bien est organique.
 *
 * TCK-794 (P18.06, décision du porteur) — le marqueur est dans l'URL de la fiche (`?src=sponsored`),
 * plus en stockage de session : un clic du milieu ou « ouvrir dans un nouvel onglet » ouvre un
 * onglet qui ne lisait pas le stockage de l'onglet d'origine. Il est retiré de l'URL une fois lu.
 */
let fetchSpy: MockInstance<typeof fetch>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('CompteurDeVue — arrivée par un emplacement (TCK-633 lot F, TCK-794)', () => {
  it('lit `src=sponsored` dans l’URL de la fiche, le retire, puis la vue suivante est organique', () => {
    window.history.replaceState(null, '', '/fr/properties/villa-saly?src=sponsored&x=1#photos');

    const { unmount } = render(<CompteurDeVue slug="villa-saly" />);
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe('/fr/properties/villa-saly?x=1#photos');
    unmount();
    render(<CompteurDeVue slug="villa-saly" />);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[0]![0])).toMatch(/\/public\/properties\/villa-saly\/view\?src=sponsored$/);
    expect(String(fetchSpy.mock.calls[1]![0])).toMatch(/\/public\/properties\/villa-saly\/view$/);
  });

  it('sans le marqueur, la vue est organique et l’URL ne change pas', () => {
    window.history.replaceState(null, '', '/fr/properties/villa-saly?src=autre');

    render(<CompteurDeVue slug="villa-saly" />);

    expect(String(fetchSpy.mock.calls[0]![0])).toMatch(/\/view$/);
    expect(window.location.search).toBe('?src=autre');
  });
});
