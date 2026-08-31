import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import IntlMessageFormat from 'intl-messageformat';
import { construireBrouillonBien } from '../brouillonBien';

/**
 * Le test lit les DICTIONNAIRES RÉELS et les formate avec le même moteur ICU que next-intl.
 * Un test qui redéclarerait le motif sur place vérifierait sa propre copie : il resterait vert
 * si `messaging.propertyDraft.message` disparaissait de `wo.json`, ce qui est précisément le
 * défaut qu'on veut attraper (AC11).
 */
function traducteurReel(locale: 'fr' | 'en' | 'wo') {
  const dict = JSON.parse(
    readFileSync(join(process.cwd(), 'src/messages', `${locale}.json`), 'utf-8'),
  ) as { messaging: { propertyDraft: Record<string, string> } };
  return ((cle, valeurs) =>
    new IntlMessageFormat(dict.messaging.propertyDraft[cle], locale).format(
      valeurs,
    ) as string) as Parameters<typeof construireBrouillonBien>[0];
}

const BIEN = { title: 'Villa 4 pièces aux Almadies', reference_number: 'TK-2451' };

describe('construireBrouillonBien', () => {
  it.each(['fr', 'en', 'wo'] as const)('rend un texte non vide en %s', (locale) => {
    const texte = construireBrouillonBien(traducteurReel(locale), BIEN);

    expect(texte.trim().length).toBeGreaterThan(20);
    expect(texte).not.toContain('propertyDraft');
    expect(texte).not.toContain('{');
  });

  it.each(['fr', 'en', 'wo'] as const)('cite le titre et la référence en %s', (locale) => {
    const texte = construireBrouillonBien(traducteurReel(locale), BIEN);

    expect(texte).toContain('Villa 4 pièces aux Almadies');
    expect(texte).toContain('TK-2451');
  });

  it("laisse intacts les guillemets et les apostrophes d'un titre", () => {
    const texte = construireBrouillonBien(traducteurReel('fr'), {
      title: `L'Oasis "Les Almadies" — 3 pièces`,
      reference_number: 'TK-9',
    });

    expect(texte).toContain(`L'Oasis "Les Almadies" — 3 pièces`);
  });

  it('produit un texte différent par locale', () => {
    const rendus = (['fr', 'en', 'wo'] as const).map((l) =>
      construireBrouillonBien(traducteurReel(l), BIEN),
    );

    expect(new Set(rendus).size).toBe(3);
  });
});
