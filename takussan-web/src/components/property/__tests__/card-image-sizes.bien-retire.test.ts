/**
 * TCK-1190 (P102.03) — la grille des biens similaires de la page d'un bien retiré a son `sizes`, et
 * aucun appelant de `PropertyCard` ne retombe plus sur celui de `/properties`.
 *
 * Le docblock de la carte le dit : `sizes` « appartient à la grille appelante, pas à la carte ».
 * `bien-retire.tsx` était le seul appelant à ne pas le passer : ses cartes, deux puis trois colonnes
 * dans `max-w-6xl`, déclaraient les 31vw puis 17,5vw de la grille de recherche — SOUS-déclarées,
 * donc floues sur écran dense (à 1 440 px : 252 px déclarés pour 352 réels).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CARD_SIZES_BIEN_RETIRE } from '../card-image-sizes';

/**
 * L'emplacement d'une carte, recalculé depuis les classes de `bien-retire.tsx` :
 * `mx-auto max-w-6xl px-4 sm:px-6 lg:px-8` (bordure comprise : `box-sizing: border-box`),
 * `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, `gap-4`.
 */
function emplacement(largeur: number): number {
  const conteneur = Math.min(largeur, 1152);
  const marges = largeur >= 1024 ? 2 * 32 : largeur >= 640 ? 2 * 24 : 2 * 16;
  const colonnes = largeur >= 1024 ? 3 : largeur >= 640 ? 2 : 1;
  return (conteneur - marges - (colonnes - 1) * 16) / colonnes;
}

/** Évalue `sizes` comme le navigateur : la première condition vraie l'emporte. */
function declare(sizes: string, largeur: number): number {
  for (const entree of sizes.split(/,(?![^(]*\))/).map((s) => s.trim())) {
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

describe('TCK-1190 — CARD_SIZES_BIEN_RETIRE suit la grille de la page d’un bien retiré', () => {
  const largeurs = Array.from({ length: 2560 - 320 + 1 }, (_, i) => 320 + i);

  it('témoin : le calcul de l’emplacement rend les relevés de la piste', () => {
    expect(emplacement(900)).toBe(418);
    expect(emplacement(1440)).toBe(352);
  });

  it('jamais sous-déclaré (image floue), à chaque largeur de 320 à 2560 px', () => {
    const sous = largeurs.filter((l) => declare(CARD_SIZES_BIEN_RETIRE, l) < emplacement(l));
    expect(sous).toEqual([]);
  });

  it('jamais sur-déclaré de plus de 40 px (image trop lourde)', () => {
    const sur = largeurs.filter((l) => declare(CARD_SIZES_BIEN_RETIRE, l) - emplacement(l) > 40);
    expect(sur).toEqual([]);
  });
});

/** Les fichiers de `src`, tests exclus. */
function sources(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return nom === '__tests__' ? [] : sources(chemin);
    return /\.tsx$/.test(nom) ? [chemin] : [];
  });
}

describe('TCK-1190 — chaque appelant de PropertyCard passe le sizes de sa grille', () => {
  it('aucun `<PropertyCard … />` sans `sizes`', () => {
    const racine = join(__dirname, '../../..');
    const fautifs: string[] = [];
    let appels = 0;
    for (const fichier of sources(racine)) {
      const texte = readFileSync(fichier, 'utf8');
      for (const m of texte.matchAll(/<PropertyCard\b[\s\S]*?\/>/g)) {
        appels += 1;
        if (!/\bsizes=/.test(m[0])) fautifs.push(relative(racine, fichier));
      }
    }
    // Témoin : le balayage voit bien les appelants (six le 2026-10-22).
    expect(appels).toBeGreaterThanOrEqual(6);
    expect(fautifs).toEqual([]);
  });
});
