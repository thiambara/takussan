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
 *   `max-w-[1920px] px-4 md:px-8 lg:px-16`, rail de filtres 264 px + gouttière 24 px à partir de
 *   `lg`, `gap-x-4`, colonnes `1 · md:3 · xl:4 · 2xl:5 · min-[112.5rem]:6`.
 * TCK-628 a élargi le conteneur (1440 → 1920) et ajouté la sixième colonne ; jusqu'à 1440 px,
 * rien ne bouge — les témoins ci-dessous en sont la preuve.
 * Un changement de grille qui ne reprend pas ce calcul fait mentir le test ET la constante : le
 * test le dit dans son nom, pour qu'on les reprenne ensemble.
 */
import { describe, it, expect } from 'vitest';

import { CARD_SIZES_RANGEE, CARD_SIZES_SEARCH_GRID } from '../card-image-sizes';

function emplacement(largeur: number): number {
  const conteneur = Math.min(largeur, 1920);
  const marges = largeur >= 1024 ? 2 * 64 : largeur >= 768 ? 2 * 32 : 2 * 16;
  const rail = largeur >= 1024 ? 264 + 24 : 0;
  const colonnes = largeur >= 1800 ? 6 : largeur >= 1536 ? 5 : largeur >= 1280 ? 4 : largeur >= 768 ? 3 : 1;
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
    // TCK-628 — au-delà de 1440 px, le conteneur n'est plus plafonné qu'à 1920.
    expect(emplacement(1536)).toBe(211.2);
    expect(emplacement(1920)).toBeCloseTo(237.33, 2);
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

/**
 * TCK-628 — `CARD_SIZES_RANGEE` décrit les rangées de l'accueil, dont la carte vaut une fraction du
 * CONTENEUR (`PropertyRow`) : `max-w-[1920px] px-4 sm:px-6` pour `<main>`, colonnes
 * selon la largeur de contenu (`@lg` 512, `@4xl` 896, `@6xl` 1152, 1440, 1680 px), écart 12 px
 * sous 512 px de contenu, 16 au-delà. Même garde que la grille : majorant, à 20 % près.
 */
function carteDeRangee(largeur: number): number {
  const gouttiere = largeur >= 640 ? 24 : 16;
  const contenu = Math.min(largeur, 1920) - 2 * gouttiere;
  const colonnes =
    contenu >= 1680 ? 7 : contenu >= 1440 ? 6 : contenu >= 1152 ? 5 : contenu >= 896 ? 4 : contenu >= 512 ? 3.2 : 2.15;
  const ecart = contenu >= 512 ? 16 : 12;
  return (contenu - (colonnes - 1) * ecart) / colonnes;
}

describe('TCK-628 — CARD_SIZES_RANGEE suit la largeur des cartes de l’accueil', () => {
  const largeurs = Array.from({ length: 2560 - 320 + 1 }, (_, i) => 320 + i);

  it('témoin : 2 cartes et un bout au téléphone, 5 à 1440 px, 7 à 1920 px', () => {
    // 390 px : 358 px de contenu, 2,15 colonnes.
    expect(carteDeRangee(390)).toBeCloseTo(160.1, 1);
    // 1440 px : 1392 px de contenu, cinq colonnes.
    expect(carteDeRangee(1440)).toBeCloseTo(265.6, 1);
    // 1920 px : 1872 px de contenu, sept colonnes.
    expect(carteDeRangee(1920)).toBeCloseTo(253.7, 1);
  });

  it('majore la carte à toutes les largeurs', () => {
    expect(largeurs.filter((l) => declare(CARD_SIZES_RANGEE, l) < carteDeRangee(l))).toEqual([]);
  });

  it('ne la majore pas de plus de 20 %', () => {
    expect(largeurs.filter((l) => declare(CARD_SIZES_RANGEE, l) > carteDeRangee(l) * 1.2)).toEqual([]);
  });
});
