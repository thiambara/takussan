import type { ClientRect, KeyboardCoordinateGetter } from '@dnd-kit/core';

/**
 * TCK-2592 — au clavier, ← et → portent la carte saisie au CENTRE de la colonne voisine (ou du bandeau
 * replié, 48 px), au lieu des 25 px par appui du capteur par défaut : il fallait une dizaine d'appuis
 * pour franchir une colonne, et le bandeau de 48 px se sautait. ↑ et ↓ gardent le pas par défaut.
 * La détection de collision du kanban est `closestCenter` : la cible est celle dont le centre est le
 * plus proche de celui de la carte, donc celle-ci.
 */
const PAS = 25;

export function centreX(r: ClientRect): number {
  return r.left + r.width / 2;
}

/** La cible voisine d'une abscisse, dans un sens ; `null` au bord. Pur, pour être éprouvé seul. */
export function cibleVoisine(rects: readonly ClientRect[], x: number, sens: 1 | -1): ClientRect | null {
  const tries = [...rects].sort((a, b) => centreX(a) - centreX(b));
  if (sens === 1) return tries.find((r) => centreX(r) > x + 1) ?? null;
  return [...tries].reverse().find((r) => centreX(r) < x - 1) ?? null;
}

export const versLaColonneVoisine: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
  const { collisionRect, droppableRects } = context;
  switch (event.code) {
    case 'ArrowRight':
    case 'ArrowLeft': {
      event.preventDefault();
      if (!collisionRect) return currentCoordinates;
      const cible = cibleVoisine([...droppableRects.values()], centreX(collisionRect), event.code === 'ArrowRight' ? 1 : -1);
      if (!cible) return currentCoordinates;
      return { x: centreX(cible) - collisionRect.width / 2, y: currentCoordinates.y };
    }
    case 'ArrowDown':
      event.preventDefault();
      return { ...currentCoordinates, y: currentCoordinates.y + PAS };
    case 'ArrowUp':
      event.preventDefault();
      return { ...currentCoordinates, y: currentCoordinates.y - PAS };
    default:
      return undefined;
  }
};
