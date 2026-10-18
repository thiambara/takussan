import { describe, expect, it } from 'vitest';

import { resumePourMeta } from '@/lib/resume-pour-meta';

/**
 * TCK-915 (P09.08) — une `<meta description>` s'arrête sur un mot entier, et un texte vide ne
 * remplace pas le repli : `"".slice(0, 160) ?? repli` rendait `""`.
 */
describe('resumePourMeta', () => {
  it.each([[null], [undefined], [''], ['   \n\t ']])('%o : rien à résumer → undefined', (texte) => {
    expect(resumePourMeta(texte)).toBeUndefined();
  });

  it('un texte court passe tel quel, espaces repliés', () => {
    expect(resumePourMeta('  Villa  avec\n\npiscine ')).toBe('Villa avec piscine');
  });

  it('un texte de exactement `max` caractères n’est pas coupé', () => {
    const texte = 'a'.repeat(160);
    expect(resumePourMeta(texte)).toBe(texte);
  });

  it('au-delà de `max`, coupé au dernier mot entier, suivi de « … »', () => {
    const mots = Array.from({ length: 60 }, (_, i) => `mot${i}`);
    const texte = mots.join(' ');
    const resume = resumePourMeta(texte)!;

    expect(resume.length).toBeLessThanOrEqual(160);
    expect(resume.endsWith('…')).toBe(true);
    // Chaque mot du résumé est un mot entier du texte.
    for (const mot of resume.slice(0, -1).trim().split(' ')) expect(mots).toContain(mot);
  });

  it('la ponctuation finale avant la coupe ne précède pas les points de suspension', () => {
    const texte = `${'Belle maison, '.repeat(11)}${'x'.repeat(40)}`;
    const resume = resumePourMeta(texte)!;
    expect(resume).toMatch(/maison…$/);
  });

  it('un seul mot plus long que `max` est coupé au caractère, faute de mieux', () => {
    const resume = resumePourMeta('x'.repeat(300))!;
    expect(resume.length).toBe(160);
    expect(resume.endsWith('…')).toBe(true);
  });

  it('respecte un `max` donné', () => {
    expect(resumePourMeta('un deux trois quatre', 10)).toBe('un deux…');
  });
});
