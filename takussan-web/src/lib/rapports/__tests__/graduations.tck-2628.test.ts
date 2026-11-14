import { describe, expect, it } from 'vitest';

import { graduationsRondes, pasRond, variationDuDernierMois } from '../graduations';

describe('TCK-2628 (AC5) — des graduations rondes', () => {
  it('les séries de la maquette : 0 · 50 · 100, 0 · 20 · 40, 0 · 10 · 20, 0 · 1 · 2', () => {
    expect(graduationsRondes([46.2, 95.2])).toEqual([0, 50, 100]);
    expect(graduationsRondes([21.4, 33.7])).toEqual([0, 20, 40]);
    expect(graduationsRondes([11.4, 18.7])).toEqual([0, 10, 20]);
    expect(graduationsRondes([0.6, 1.6, 0])).toEqual([0, 1, 2]);
  });

  it('en francs CFA : 101 394 241 → 0 · 100 M · 200 M, jamais la valeur brute', () => {
    expect(graduationsRondes([101_394_241, 52_000_000])).toEqual([0, 100_000_000, 200_000_000]);
    expect(graduationsRondes([95_200_000])).toEqual([0, 50_000_000, 100_000_000]);
  });

  it('chaque pas est 1, 2, 2,5 ou 5 × 10ⁿ, et deux pas couvrent le maximum', () => {
    for (const max of [0.3, 1, 7, 12, 49, 50, 51, 99, 230, 4_999, 12_345_678]) {
      const pas = pasRond(max);
      expect(2 * pas, String(max)).toBeGreaterThanOrEqual(max);
      const mantisse = Number((pas / 10 ** Math.floor(Math.log10(pas))).toPrecision(6));
      expect([1, 2, 2.5, 5], String(max)).toContain(mantisse);
    }
    expect(pasRond(0.5)).toBe(0.25);
  });

  it('une série vide, nulle ou manquante : 0 · 1 · 2, sans NaN', () => {
    expect(graduationsRondes([])).toEqual([0, 1, 2]);
    expect(graduationsRondes([0, 0])).toEqual([0, 1, 2]);
    expect(graduationsRondes([null, null])).toEqual([0, 1, 2]);
  });
});

describe('TCK-2628 — la variation du dernier mois', () => {
  it('+8 % : 95,2 sur 88,1', () => {
    expect(variationDuDernierMois([88.1, 95.2])).toBe(8);
    expect(variationDuDernierMois([10, 5])).toBe(-50);
  });

  it('sans sens : un seul mois, un mois manquant, un précédent nul', () => {
    expect(variationDuDernierMois([5])).toBeNull();
    expect(variationDuDernierMois([null, 5])).toBeNull();
    expect(variationDuDernierMois([5, null])).toBeNull();
    expect(variationDuDernierMois([0, 5])).toBeNull();
  });
});
