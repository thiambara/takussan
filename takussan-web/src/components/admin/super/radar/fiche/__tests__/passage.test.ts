import { describe, expect, it } from 'vitest';
import { localiserPassage } from '../passage';

/** Le texte que `localiserPassage` rend, relu dans la source d'origine. */
function lu(source: string, passage: string): string | null {
  const trouve = localiserPassage(source, passage);
  return trouve ? source.slice(trouve.debut, trouve.fin) : null;
}

describe('localiserPassage (TCK-2387)', () => {
  it('trouve un passage exact, avec ses indices dans le texte d\'origine', () => {
    const source = 'Villa a louer aux Almadies, 400 000 FCFA par mois';
    expect(localiserPassage(source, '400 000 FCFA')).toEqual({ debut: 28, fin: 40 });
  });

  it('replie la casse', () => {
    const source = 'VILLA A LOUER AUX ALMADIES';
    expect(lu(source, 'aux almadies')).toBe('AUX ALMADIES');
  });

  it('replie les blancs, sauts de ligne compris', () => {
    const source = 'Prix :\n  400 000\n\nFCFA / mois';
    expect(lu(source, '400 000 FCFA')).toBe('400 000\n\nFCFA');
  });

  it('replie les blancs insécables et les tabulations', () => {
    const source = 'Prix :\t400 000 FCFA';
    expect(lu(source, 'Prix : 400 000 FCFA')).toBe(source);
  });

  it('replie les apostrophes et les guillemets typographiques', () => {
    const source = 'Villa d’angle, « vue mer » et "jardin"';
    expect(lu(source, "d'angle")).toBe('d’angle');
    expect(lu(source, '"vue mer"')).toBe('vue mer');
    expect(lu(source, '« jardin »')).toBe('jardin');
  });

  it('localise un passage coupé par une ellipse du premier au dernier segment, dans l\'ordre', () => {
    const source = 'Belle villa. Quatre chambres, salon, cuisine equipee. Piscine. Libre.';
    expect(lu(source, 'Belle villa… cuisine equipee')).toBe('Belle villa. Quatre chambres, salon, cuisine equipee');
    expect(lu(source, 'Quatre chambres ... Piscine')).toBe('Quatre chambres, salon, cuisine equipee. Piscine');
  });

  it('cherche chaque segment après la fin du précédent', () => {
    const source = 'Piscine. Villa. Piscine';
    // « Piscine » avant « Villa » existe, mais « Villa … Piscine » doit prendre la seconde.
    expect(localiserPassage(source, 'Villa… Piscine')).toEqual({ debut: 9, fin: 23 });
    expect(localiserPassage(source, 'Libre… Villa')).toBeNull();
    expect(localiserPassage(source, 'Piscine… Villa… Piscine')).toEqual({ debut: 0, fin: 23 });
  });

  it('garde les accents d\'abord, puis les ignore à défaut — comme le fait l\'API', () => {
    expect(lu('Villa à louer', 'villa a louer')).toBe('Villa à louer');
    expect(lu('Villa a louer', 'villa à louer')).toBe('Villa a louer');
    // L'exact prime : le premier « a » nu n'est pas pris pour « à ».
    expect(localiserPassage('a louer. à louer', 'à louer')).toEqual({ debut: 9, fin: 16 });
  });

  it('rend null pour un passage absent, vide ou réduit à des ellipses', () => {
    expect(localiserPassage('Villa a louer', 'Appartement')).toBeNull();
    expect(localiserPassage('Villa a louer', '')).toBeNull();
    expect(localiserPassage('Villa a louer', '   ')).toBeNull();
    expect(localiserPassage('Villa a louer', '…')).toBeNull();
    expect(localiserPassage('', 'Villa')).toBeNull();
  });

  it('rend des indices exacts quand le texte replié a une autre longueur que l\'original', () => {
    const source = '   Villa   \n\n  a   louer   ';
    expect(lu(source, 'villa a louer')).toBe('Villa   \n\n  a   louer');
    const t = localiserPassage(source, 'a louer');
    expect(t).toEqual({ debut: source.indexOf('a   louer'), fin: source.indexOf('louer') + 5 });
  });
});
