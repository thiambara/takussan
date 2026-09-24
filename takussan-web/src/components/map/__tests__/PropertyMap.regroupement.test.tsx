import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import L from 'leaflet';
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
import { ZOOM_MAX_DE_LA_CARTE, elementsDeCarte, indexerLesBiens, zoomQuiSepare } from '../regroupement';

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
  vi.restoreAllMocks();
});

/**
 * `flyTo` intercepté : jsdom n'anime rien, et c'est l'APPEL qui porte le câblage de l'AC2 — la
 * position de la grappe et le zoom qui la sépare. L'instance de la carte est gardée au passage.
 */
function espionnerLeVol() {
  const vols: Array<{ carte: L.Map; position: L.LatLngExpression; zoom: number | undefined }> = [];
  vi.spyOn(L.Map.prototype, 'flyTo').mockImplementation(function (
    this: L.Map,
    position: L.LatLngExpression,
    zoom?: number,
  ) {
    vols.push({ carte: this, position, zoom });
    return this;
  });
  return vols;
}

/** Un tap sur une icône de Leaflet : Leaflet écoute le clic sur le conteneur de la carte. */
const taper = (icone: Element) => fireEvent.click(icone);

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

  it('AC2 — un tap sur une grappe VOLE jusqu’au zoom qui la sépare, sur sa position', async () => {
    reponse = collection(DAKAR);
    const vols = espionnerLeVol();
    const { container } = render(withIntl(<PropertyMap />));
    await waitFor(() => expect(container.querySelectorAll('.takussan-cluster-marker').length).toBeGreaterThan(0));

    const icone = container.querySelector('.takussan-cluster-marker')!;
    taper(icone);

    expect(vols).toHaveLength(1);
    const { carte, position, zoom } = vols[0];
    // La grappe tapée, retrouvée dans un index construit à part : mêmes points, mêmes options,
    // donc mêmes grappes au même zoom.
    const [lat, lng] = position as [number, number];
    const index = indexerLesBiens(DAKAR);
    const grappe = elementsDeCarte(index, [-18, 12, -11, 17], carte.getZoom()).find(
      (e) => e.genre === 'grappe' && e.lat === lat && e.lng === lng,
    );
    expect(grappe?.genre).toBe('grappe');
    if (grappe?.genre !== 'grappe') return;
    expect(grappe.nombre).toBe(Number(icone.textContent?.trim()));
    expect(zoom).toBe(zoomQuiSepare(index, grappe.id));
    expect(zoom).toBeGreaterThan(carte.getZoom());
  });

  it('AC2 — la carte et ses tuiles vont jusqu’au zoom 19 : sans quoi une grappe séparée au 19 resterait entière', async () => {
    // Le défaut de Leaflet est 18 (celui des tuiles) : `flyTo(…, 19)` y serait ramené à 18.
    reponse = collection(DAKAR);
    const vols = espionnerLeVol();
    const { container } = render(withIntl(<PropertyMap />));
    await waitFor(() => expect(container.querySelectorAll('.takussan-cluster-marker').length).toBeGreaterThan(0));
    taper(container.querySelector('.takussan-cluster-marker')!);

    const carte = vols[0].carte;
    expect(carte.getMaxZoom()).toBe(ZOOM_MAX_DE_LA_CARTE);
    const tuiles: L.TileLayer[] = [];
    carte.eachLayer((couche) => {
      if (couche instanceof L.TileLayer) tuiles.push(couche);
    });
    expect(tuiles).toHaveLength(1);
    expect(tuiles[0].options.maxZoom).toBe(ZOOM_MAX_DE_LA_CARTE);
  });

  it('une grappe qu’aucun zoom ne sépare s’ouvre en LISTE de ses biens, sans voler', async () => {
    // Quatre biens aux mêmes coordonnées (les appartements d'un immeuble), et un cinquième au loin.
    reponse = collection([
      bien(1, 14.7, -17.46),
      bien(2, 14.7, -17.46),
      bien(3, 14.7, -17.46),
      bien(4, 14.7, -17.46),
      bien(5, 14.75, -17.35),
    ]);
    const vols = espionnerLeVol();
    const { container } = render(withIntl(<PropertyMap />));
    // L'icône de Leaflet ET le bouton qu'elle porte ont ce nom : on tape l'icône.
    const [bouton] = await screen.findAllByRole('button', { name: '4 biens tout proches — voir la liste' });

    taper(bouton.closest('.leaflet-marker-icon')!);

    expect(vols).toHaveLength(0);
    const popup = await waitFor(() => {
      const p = container.querySelector('.leaflet-popup') as HTMLElement | null;
      expect(p).not.toBeNull();
      return p!;
    });
    expect(within(popup).getByText('4 biens tout proches')).toBeInTheDocument();
    const liens = within(popup).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(liens).toHaveLength(4);
    expect(liens.every((h) => /\/properties\/bien-[1-4]$/.test(h ?? ''))).toBe(true);
  });
});
