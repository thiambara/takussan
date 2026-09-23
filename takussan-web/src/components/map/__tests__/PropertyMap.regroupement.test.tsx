import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import type { PropertyMapFeature, PropertyMapResponse } from '@/lib/queries/properties';

/**
 * TCK-553 — la carte pose des grappes (M1) et affiche SON compte, pas celui de la liste (M3, AC4).
 *
 * Leaflet tourne ici pour de vrai. jsdom n'a pas de mise en page : la taille du conteneur, que
 * Leaflet lit par `clientWidth`/`clientHeight`, est donnée à la main — celle de la carte plein écran
 * mesurée à 390 × 844 sous une `nav` de 71 px.
 */

let reponse: PropertyMapResponse | undefined;
vi.mock('@/lib/queries/properties', async () => {
  const reel = await vi.importActual<typeof import('@/lib/queries/properties')>('@/lib/queries/properties');
  return {
    ...reel,
    usePropertyMapQuery: () => ({ data: reponse, isFetching: false }),
  };
});

import { PropertyMap } from '../PropertyMap';

function bien(id: number, lat: number, lng: number): PropertyMapFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: {
      id,
      slug: `bien-${id}`,
      title: `Bien ${id}`,
      price: 250000,
      currency: 'XOF',
      type: 'apartment',
      contract_type: 'rent',
      thumbnail: null,
    },
  };
}

function collection(features: PropertyMapFeature[], truncated = false): PropertyMapResponse {
  return {
    type: 'FeatureCollection',
    features,
    meta: { limit: 500, returned: features.length, truncated },
  };
}

/** 129 biens dans Dakar — le compte du relevé du ticket —, en grille serrée. */
const DAKAR = Array.from({ length: 129 }, (_, i) =>
  bien(i + 1, 14.66 + (i % 12) * 0.006, -17.48 + Math.floor(i / 12) * 0.006),
);

const descripteurs = {
  w: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth'),
  h: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight'),
};
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 390 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 773 });
});
afterAll(() => {
  if (descripteurs.w) Object.defineProperty(HTMLElement.prototype, 'clientWidth', descripteurs.w);
  if (descripteurs.h) Object.defineProperty(HTMLElement.prototype, 'clientHeight', descripteurs.h);
});
beforeEach(() => {
  reponse = undefined;
});

describe('TCK-553 — PropertyMap', () => {
  it('M1 — 129 biens serrés : des grappes, et moins d’éléments posés que de biens', async () => {
    reponse = collection(DAKAR);
    const { container } = render(withIntl(<PropertyMap />));

    await waitFor(() => expect(container.querySelectorAll('.takussan-cluster-marker').length).toBeGreaterThan(0));
    const poses = container.querySelectorAll('.leaflet-marker-icon').length;
    expect(poses).toBeLessThan(DAKAR.length);

    // Chaque grappe porte son nombre, et le total des grappes et des isolés, c'est tout le monde.
    const grappes = [...container.querySelectorAll('.takussan-cluster-marker')].map((g) =>
      Number(g.textContent?.trim()),
    );
    const isoles = container.querySelectorAll('.takussan-price-marker').length;
    expect(grappes.reduce((a, b) => a + b, 0) + isoles).toBe(DAKAR.length);
  });

  it('une grappe dit ce qu’un tap fera — zoomer — dans son nom accessible', async () => {
    reponse = collection(DAKAR);
    render(withIntl(<PropertyMap />));
    const boutons = await screen.findAllByRole('button', { name: /biens ici — zoomer pour les voir/ });
    expect(boutons.length).toBeGreaterThan(0);
  });

  it('AC4 — le compte affiché est celui des points reçus de /map', async () => {
    reponse = collection(DAKAR);
    const { container } = render(withIntl(<PropertyMap />));
    await waitFor(() =>
      expect(container.querySelector('[data-compte-carte]')?.textContent).toBe('129 biens sur la carte'),
    );
  });

  it('AC4 — plafonné, le compte le dit', () => {
    reponse = collection(DAKAR, true);
    const { container } = render(withIntl(<PropertyMap />));
    expect(container.querySelector('[data-compte-carte]')?.textContent).toBe(
      '129+ biens — zoomez pour affiner',
    );
  });

  it('avant la première réponse : le compte ne dit pas zéro, il attend', () => {
    const { container } = render(withIntl(<PropertyMap />));
    expect(container.querySelector('[data-compte-carte]')?.textContent).toBe('Chargement…');
  });

  it('plein écran sous lg : ni hauteur fixe ni cadre sous lg, ceux d’avant à partir de lg', () => {
    reponse = collection(DAKAR);
    const { container } = render(withIntl(<PropertyMap pleinEcranSousLg />));
    const cadre = container.querySelector('.leaflet-container')!.parentElement!;
    const classes = cadre.className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(['h-full', 'lg:h-[520px]', 'lg:rounded-xl', 'lg:border']));
    expect(classes).not.toContain('h-[520px]');
    expect(classes).not.toContain('rounded-xl');
  });
});
