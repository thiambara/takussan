/**
 * TCK-555 — `CARD_SIZES_SEARCH_GRID` décrit la grille de `/properties` : cette garde la tient
 * contre la géométrie de la grille, à chaque largeur de 320 à 2560 px.
 *
 * La valeur tenait jusqu'ici à une mesure manuelle, et c'est ainsi qu'elle avait dérivé : TCK-529
 * a déplacé les paliers de colonnes sans la reprendre, et elle est restée SOUS-déclarée à quatre
 * paliers sur cinq (image floue sur écran dense) pendant des semaines, sans qu'un test rougisse.
 *
 * L'emplacement est recalculé depuis les classes de la grille (relevé au navigateur le 2026-09-23 :
 * les valeurs ci-dessous y sont exactes au pixel à 18 largeurs — notes de TCK-555) :
 *   `max-w-[1440px] px-4 md:px-8 lg:px-16`, rail de filtres 264 px + gouttière 24 px à partir de
 *   `lg`, `gap-x-4`, colonnes `1 · md:3 · xl:4 · 2xl:5`.
 * Un changement de grille qui ne reprend pas ce calcul fait mentir le test ET la constante : le
 * test le dit dans son nom, pour qu'on les reprenne ensemble.
 */
import { describe, it, expect } from 'vitest';

import { CARD_SIZES_SEARCH_GRID } from '../card-image-sizes';

function emplacement(largeur: number): number {
  const conteneur = Math.min(largeur, 1440);
  const marges = largeur >= 1024 ? 2 * 64 : largeur >= 768 ? 2 * 32 : 2 * 16;
  const rail = largeur >= 1024 ? 264 + 24 : 0;
  const colonnes = largeur >= 1536 ? 5 : largeur >= 1280 ? 4 : largeur >= 768 ? 3 : 1;
  return (conteneur - marges - rail - (colonnes - 1) * 16) / colonnes;
}

/** Évalue `sizes` comme le navigateur : la première condition vraie l'emporte. */
function declare(sizes: string, largeur: number): number {
  for (const entree of sizes.split(',').map((s) => s.trim())) {
    const m = /^\(max-width:\s*(\d+)px\)\s+(.+)$/.exec(entree);
    const [condition, valeur] = m ? [Number(m[1]), m[2]] : [Infinity, entree];
    if (largeur > condition) continue;
    const vw = /^(\d+(?:\.\d+)?)vw$/.exec(valeur);
    if (vw) return (Number(vw[1]) * largeur) / 100;
    const px = /^(\d+(?:\.\d+)?)px$/.exec(valeur);
    if (px) return Number(px[1]);
    const calc = /^calc\(100vw - (\d+)px\)$/.exec(valeur);
    if (calc) return largeur - Number(calc[1]);
    throw new Error(`valeur de sizes non comprise par le test : ${valeur}`);
  }
  throw new Error('sizes sans valeur par défaut');
}

describe('TCK-555 — CARD_SIZES_SEARCH_GRID suit la grille de /properties', () => {
  const largeurs = Array.from({ length: 2560 - 320 + 1 }, (_, i) => 320 + i);

  it('témoin : le calcul de l’emplacement rend les relevés du navigateur', () => {
    expect(emplacement(360)).toBe(328);
    expect(emplacement(768)).toBe(224);
    expect(emplacement(1024)).toBe(192);
    expect(emplacement(1280)).toBe(204);
    expect(emplacement(1440)).toBe(244);
    expect(emplacement(1920)).toBe(192);
  });

  it('majore l’emplacement à toutes les largeurs — sous-déclarer rend l’image floue', () => {
    const sous = largeurs.filter((l) => declare(CARD_SIZES_SEARCH_GRID, l) < emplacement(l));
    expect(sous).toEqual([]);
  });

  it('ne le majore pas de plus de 20 % — sur-déclarer coûte des octets à chaque carte', () => {
    const trop = largeurs.filter((l) => declare(CARD_SIZES_SEARCH_GRID, l) > emplacement(l) * 1.2);
    expect(trop).toEqual([]);
  });
});
