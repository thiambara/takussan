import { describe, expect, it } from 'vitest';

import { buttonVariants } from '@/components/ui/button';
import {
  JETONS_CLAIR,
  JETONS_SOMBRE,
  SEUIL_AA_TEXTE,
  contraste,
  fmt,
} from '@/test/contraste-wcag';

/**
 * Revue design 2026-09-16 — le SURVOL du bouton plein tient l'AA dans les deux thèmes.
 *
 * Le survol passe par `--primary-deep`. La première version ne le définissait que dans `:root` :
 * sous une portée `.dark` (bandeau de `agency-detail`), l'encre devient sombre et le survol
 * rendait #1f1812 sur #823c20 = 2,18:1 (relecture adverse, F2). `jetons-compiles.test.ts` garde
 * que ces tables sont bien celles de `globals.css`.
 */
describe('bouton plein — survol', () => {
  it('le survol est bien porté par --primary-deep', () => {
    expect(buttonVariants()).toContain('hover:bg-[var(--primary-deep)]');
  });

  for (const [theme, jetons] of [
    ['clair', JETONS_CLAIR],
    ['sombre', JETONS_SOMBRE],
  ] as const) {
    it(`encre sur survol ≥ 4,5:1 en thème ${theme}`, () => {
      const ratio = contraste(jetons['primary-foreground'], jetons['primary-deep']);
      expect(ratio, `${theme} : ${fmt(ratio)}`).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE);
    });
  }

  it('non-vacuité : la valeur claire sous l’encre sombre échouerait', () => {
    expect(contraste(JETONS_SOMBRE['primary-foreground'], JETONS_CLAIR['primary-deep'])).toBeLessThan(
      SEUIL_AA_TEXTE,
    );
  });
});
