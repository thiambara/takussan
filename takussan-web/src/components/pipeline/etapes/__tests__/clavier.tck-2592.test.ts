import { describe, expect, it } from 'vitest';
import type { ClientRect } from '@dnd-kit/core';

import { cibleVoisine, versLaColonneVoisine } from '../clavier';

const rect = (left: number, width: number): ClientRect => ({ left, width, top: 0, height: 600, right: left + width, bottom: 600 });

/** TCK-2592 — ← → portent la carte au centre de la cible voisine, bandeau replié de 48 px compris. */
const COLONNES = [rect(0, 300), rect(312, 300), rect(624, 300), rect(936, 300)];
const GAGNE = rect(1248, 48);
const PERDU = rect(1308, 48);
const TOUTES = [PERDU, ...COLONNES, GAGNE];

describe('cibleVoisine', () => {
  it('trouve la colonne suivante, puis les bandeaux, dans l’ordre des abscisses', () => {
    expect(cibleVoisine(TOUTES, 150, 1)).toBe(COLONNES[1]);
    expect(cibleVoisine(TOUTES, 1086, 1)).toBe(GAGNE);
    expect(cibleVoisine(TOUTES, 1272, 1)).toBe(PERDU);
    expect(cibleVoisine(TOUTES, 1332, 1)).toBeNull();
    expect(cibleVoisine(TOUTES, 1332, -1)).toBe(GAGNE);
    expect(cibleVoisine(TOUTES, 150, -1)).toBeNull();
  });
});

describe('versLaColonneVoisine', () => {
  const contexte = (collision: ClientRect) =>
    ({
      active: null,
      currentCoordinates: { x: collision.left, y: collision.top },
      context: { collisionRect: collision, droppableRects: new Map(TOUTES.map((r, i) => [String(i), r])) },
    }) as unknown as Parameters<typeof versLaColonneVoisine>[1];
  const touche = (code: string) => ({ code, preventDefault: () => undefined }) as unknown as KeyboardEvent;

  it('→ depuis Négociation centre la carte sur le bandeau « Gagné »', () => {
    const carte = rect(946, 280);
    const suite = versLaColonneVoisine(touche('ArrowRight'), contexte(carte));
    expect(suite).toEqual({ x: 1272 - 140, y: 0 });
  });

  it('↓ garde le pas par défaut, une autre touche ne fait rien', () => {
    const carte = rect(10, 280);
    expect(versLaColonneVoisine(touche('ArrowDown'), contexte(carte))).toEqual({ x: 10, y: 25 });
    expect(versLaColonneVoisine(touche('KeyA'), contexte(carte))).toBeUndefined();
  });
});
