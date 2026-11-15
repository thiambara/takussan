/**
 * TCK-2882 — les tuiles OpenStreetMap de la vignette : elles centrent le bien, quel qu'il soit.
 */
import { describe, expect, it } from 'vitest';

import { coordonneesLisibles, pixelsDuMonde, TAILLE_DE_TUILE, tuilesAutourDe } from '../tuiles-osm';

describe('tuilesAutourDe', () => {
  it('Dakar-Plateau (14.6681, -17.4318) au zoom 16 : la tuile 29594/30068 (formule des tuiles OSM) porte le point, et le point est à l’origine du repère', () => {
    const tuiles = tuilesAutourDe(14.6681, -17.4318, 16);
    expect(tuiles).toHaveLength(9);
    const centre = tuiles[4]!;
    expect([centre.x, centre.y]).toEqual([29594, 30068]);
    expect(centre.url).toBe('https://tile.openstreetmap.org/16/29594/30068.png');
    // Le point tombe DANS la tuile du centre : son coin haut-gauche est à gauche et au-dessus de lui.
    expect(centre.gauche).toBeLessThanOrEqual(0);
    expect(centre.gauche).toBeGreaterThan(-TAILLE_DE_TUILE);
    expect(centre.haut).toBeLessThanOrEqual(0);
    expect(centre.haut).toBeGreaterThan(-TAILLE_DE_TUILE);
    // Le décalage est exactement celui des pixels du monde : pas une tuile posée au coin.
    const p = pixelsDuMonde(14.6681, -17.4318, 16);
    expect(centre.gauche).toBe(Math.round(centre.x * TAILLE_DE_TUILE - p.x));
    expect(centre.haut).toBe(Math.round(centre.y * TAILLE_DE_TUILE - p.y));
  });

  it('les voisines se suivent de 256 px, et couvrent au moins 256 px de chaque côté du point', () => {
    const tuiles = tuilesAutourDe(14.6681, -17.4318);
    const gauches = [...new Set(tuiles.map((t) => t.gauche))].sort((a, b) => a - b);
    expect(gauches[1]! - gauches[0]!).toBe(256);
    expect(gauches[0]!).toBeLessThanOrEqual(-256);
    expect(Math.max(...gauches) + 256).toBeGreaterThanOrEqual(256);
  });
});

describe('coordonneesLisibles', () => {
  it('rend deux nombres, y compris lus d’une chaîne', () => {
    expect(coordonneesLisibles('14.6681', -17.4318)).toEqual({ latitude: 14.6681, longitude: -17.4318 });
  });
  it.each([
    [null, -17.4],
    [14.6, undefined],
    ['', -17.4],
    ['abc', -17.4],
    [95, -17.4],
    [14.6, 200],
  ])('refuse (%s, %s)', (lat, lon) => {
    expect(coordonneesLisibles(lat, lon)).toBeNull();
  });
});
