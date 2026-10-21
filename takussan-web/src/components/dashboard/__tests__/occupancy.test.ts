import { describe, expect, it } from 'vitest';

import { formatOccupancyRate } from '../occupancy';

// P93.05 (TCK-1114) — la tuile « Taux d'occupation » de l'agence et celle du bailleur.
describe('formatOccupancyRate', () => {
  it('rend un tiret sans bien éligible (null ou clé absente), jamais 0 %', () => {
    expect(formatOccupancyRate(null, 'fr')).toBe('—');
    expect(formatOccupancyRate(undefined, 'fr')).toBe('—');
  });

  it('rend 0 % quand des biens éligibles sont tous vacants', () => {
    expect(formatOccupancyRate(0, 'fr')).toMatch(/^0\s*%$/);
  });

  it('formate des points (0..100) en pourcentage de la locale', () => {
    expect(formatOccupancyRate(22.67, 'fr')).toMatch(/^22,67\s*%$/);
  });
});
