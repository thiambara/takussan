import { describe, expect, it } from 'vitest';

import { en, fr } from '@/content/legal/notice';
import { contenuLegal } from '@/lib/legal-content';

/**
 * TCK-633 (ADR-0062 §3) — le référentiel des régions, villes et quartiers est extrait
 * d'OpenStreetMap : la mention ODbL lui est due, pas seulement aux fonds de carte. La ligne des
 * crédits nomme donc les DEUX, dans chaque langue publiée.
 */
function ligneOsm(texte: string): string {
  const lignes = texte.split('\n').filter((l) => l.includes('OpenStreetMap'));
  expect(lignes).toHaveLength(1);
  return lignes[0];
}

describe('mentions légales — crédit OpenStreetMap (TCK-633)', () => {
  it('fr : la carte ET le référentiel géographique, sous ODbL', () => {
    const ligne = ligneOsm(fr);
    expect(ligne).toMatch(/référentiel des régions, villes et quartiers/);
    expect(ligne).toMatch(/Open Database License \(ODbL\)/);
  });

  it('en : the map AND the geographic directory, under the ODbL', () => {
    const ligne = ligneOsm(en);
    expect(ligne).toMatch(/region, city and neighbourhood directory/);
    expect(ligne).toMatch(/Open Database License \(ODbL\)/);
  });

  // `notice.wo` est vide À DESSEIN : la page wolof rend le français, mention comprise.
  it('wo : la page rend le texte français, la mention avec', () => {
    const contenu = contenuLegal('notice', 'wo');
    if (contenu.etat !== 'publie') throw new Error('mentions légales non publiées');
    expect(contenu.mention).toBe('francais-seul');
    expect(ligneOsm(contenu.texte)).toMatch(/référentiel des régions, villes et quartiers/);
  });
});
