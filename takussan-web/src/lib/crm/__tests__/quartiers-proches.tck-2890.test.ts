/** TCK-2890 — les quartiers proches : approuvés, pas déjà choisis, triés par distance, trois au plus. */
import { describe, expect, it } from 'vitest';

import { distanceKm, quartiersProches, villeDesQuartiers } from '../quartiers-proches';

const q = (name: string, latitude: number | null, longitude: number | null, status = 'approved') => ({ name, latitude, longitude, status });

describe('quartiersProches', () => {
  const LISTE = [q('Fann', 14.6905, -17.4655), q('Point E', 14.696, -17.46), q('Mermoz', 14.705, -17.475), q('Sacré-Cœur', 14.712, -17.46), q('Almadies', 14.745, -17.515), q('Amitié', 14.692, -17.462, 'pending')];

  it('les trois plus proches, approuvés, du plus proche au plus lointain ; accents et casse ignorés', () => {
    expect(quartiersProches(['FANN'], LISTE)).toEqual(['Point E', 'Mermoz', 'Sacré-Cœur']);
  });

  it('au plus proche de PLUSIEURS quartiers choisis, jamais un déjà choisi', () => {
    expect(quartiersProches(['Fann', 'Almadies'], LISTE, 2)).toEqual(['Point E', 'Mermoz']);
    expect(quartiersProches(['Fann', 'Point E', 'Mermoz', 'sacre-coeur'], LISTE)).toEqual(['Almadies']);
  });

  it('aucun quartier choisi situé : aucune suggestion', () => {
    expect(quartiersProches(['Inconnu'], LISTE)).toEqual([]);
    expect(quartiersProches(['Fann'], [q('Fann', null, null), q('Point E', 14.696, -17.46)])).toEqual([]);
  });

  it('la distance à vol d’oiseau', () => {
    expect(distanceKm({ latitude: 14.6905, longitude: -17.4655 }, { latitude: 14.696, longitude: -17.46 })).toBeCloseTo(0.85, 1);
  });
});

describe('villeDesQuartiers', () => {
  const VILLES = [{ id: 1, name: 'Dakar', slug: 'dakar' }, { id: 2, name: 'Thiès', slug: 'thies' }];
  it('la première ville recherchée connue, sinon Dakar', () => {
    expect(villeDesQuartiers(['Mbour', 'thies'], VILLES)?.id).toBe(2);
    expect(villeDesQuartiers([], VILLES)?.id).toBe(1);
    expect(villeDesQuartiers([], [VILLES[1]])).toBeNull();
  });
});
