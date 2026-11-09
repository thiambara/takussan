import { describe, expect, it } from 'vitest';

import type { PropertyListItem } from '@/types/property';
import { insererEmplacements } from '../emplacements';

/** Un bien réduit à ce que l'insertion lit : son identité, et sa position s'il en porte une. */
const bien = (id: number, position?: number) =>
  ({ id, ...(position === undefined ? {} : { position }) }) as unknown as PropertyListItem;

const organiques = (n: number) => Array.from({ length: n }, (_, i) => bien(i + 1));

const forme = (suite: ReturnType<typeof insererEmplacements>) =>
  suite.map((c) => (c.genre === 'sponsorise' ? `S${c.bien.id}` : String(c.bien.id)));

describe('insererEmplacements — TCK-2500, la position rendue par l’API', () => {
  it('pose chaque vedette à SA position : tête, puis après dix cartes, jamais recalculée', () => {
    const suite = insererEmplacements(organiques(25), [bien(901, 0), bien(902, 11), bien(903, 22)]);

    expect(suite).toHaveLength(28);
    expect(suite[0]).toMatchObject({ genre: 'sponsorise', bien: { id: 901 } });
    expect(suite[11]).toMatchObject({ genre: 'sponsorise', bien: { id: 902 } });
    expect(suite[22]).toMatchObject({ genre: 'sponsorise', bien: { id: 903 } });
    // Dix cartes organiques entre deux vedettes, dans l'ordre de `data`.
    expect(forme(suite).slice(0, 13)).toEqual(['S901', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'S902', '11']);
    expect(suite.filter((c) => c.genre === 'organique').map((c) => c.bien.id)).toEqual(
      organiques(25).map((b) => b.id),
    );
  });

  it('suit la position de l’API même quand elle n’est pas « tous les dix » (aucun calcul du front)', () => {
    // Une API qui espacerait autrement (constante changée côté back) n'impose aucun changement ici.
    const suite = insererEmplacements(organiques(12), [bien(901, 3), bien(902, 7)]);
    expect(forme(suite)).toEqual(['1', '2', '3', 'S901', '4', '5', '6', 'S902', '7', '8', '9', '10', '11', '12']);
  });

  it('sans vedette, la suite est celle de `data`', () => {
    expect(forme(insererEmplacements(organiques(3), []))).toEqual(['1', '2', '3']);
  });

  it('une réponse sans `position` (API antérieure) garde les vedettes en tête, dans leur ordre', () => {
    expect(forme(insererEmplacements(organiques(3), [bien(901), bien(902)]))).toEqual(['S901', 'S902', '1', '2', '3']);
  });

  it('une position au-delà de la suite pose la vedette à la fin plutôt que de la perdre', () => {
    expect(forme(insererEmplacements(organiques(2), [bien(901, 40)]))).toEqual(['1', '2', 'S901']);
  });
});
