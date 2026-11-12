/** TCK-2682 — l'armement d'un geste de la file guidée (armement.ts). */
import { describe, expect, it } from 'vitest';

import { clicPremature, DELAI_D_ARMEMENT } from '../armement';

describe('clicPremature', () => {
  it('un geste qui n’a pas encore été vu prêt n’est jamais armé', () => {
    expect(clicPremature(null, 10_000)).toBe(true);
  });

  it('prématuré avant le délai, armé dès le délai écoulé', () => {
    expect(DELAI_D_ARMEMENT).toBe(500);
    expect(clicPremature(1_000, 1_140)).toBe(true);
    expect(clicPremature(1_000, 1_499)).toBe(true);
    expect(clicPremature(1_000, 1_500)).toBe(false);
    expect(clicPremature(1_000, 1_200, 100)).toBe(false);
  });
});
