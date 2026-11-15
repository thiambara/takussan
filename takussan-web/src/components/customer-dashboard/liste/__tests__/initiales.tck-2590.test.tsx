/**
 * TCK-2590 (fiche de fidélité, écart des initiales ; relevé de verif-commercial) — les initiales d'un
 * client sont l'avatar de la maquette : `Math.round(taille × 0,36)`, soit 12 px à 32, 16 à 44, 19 à 52.
 * Elles lisent les jetons de la primitive (`size-avatar-N`, `text-avatar-N`, en rem fixes) au lieu d'un
 * pas calculé et de `text-legende` (11 px). La valeur de chaque jeton est épinglée par
 * `primitives-de-l-app.test.tsx`.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InitialesDuClient } from '../pieces';

describe('InitialesDuClient (TCK-2590)', () => {
  it.each([32, 44, 52] as const)('à %i px : la taille et la police des jetons de l’avatar, rien d’autre', (taille) => {
    const { container } = render(<InitialesDuClient texte="MF" taille={taille} />);
    const pastille = container.firstElementChild as HTMLElement;
    expect(pastille).toHaveTextContent('MF');
    expect(pastille).toHaveClass(`size-avatar-${taille}`, `text-avatar-${taille}`);
    // Ni l'ancien pas calculé, ni une taille de l'échelle qui rétrécit au bureau, ni une autre police.
    expect(pastille.className).not.toMatch(/size-\[|size-1[13]\b|text-(legende|base|lg)\b/);
  });
});
