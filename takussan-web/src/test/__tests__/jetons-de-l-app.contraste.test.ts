import { describe, expect, it } from 'vitest';

import {
  JETONS_CLAIR,
  JETONS_SOMBRE,
  SEUIL_AA_TEXTE,
  composer,
  contraste,
  fmt,
  versRvb,
} from '../contraste-wcag';

/**
 * TCK-2685 (A § 4, AC5) — l'encre douce de la partie connectée et son inverse.
 *
 * Les maquettes écrivent `foreground/70` à `/85` (385 occ.) ; le produit retient une seule encre,
 * celle de la valeur majoritaire (`/80`), mais OPAQUE : une encre translucide ne se mesure pas sans
 * connaître son fond, et la règle de TCK-658 les refuse. Ce test prouve trois choses :
 *
 * 1. le jeton est opaque (six chiffres hexadécimaux, aucun alpha) ;
 * 2. il est bien la composition annoncée — `foreground` à 80 % sur `card` (l'inverse : `background`
 *    à 70 % sur `foreground`), à un canal près (arrondi) ;
 * 3. il tient ≥ 4,5:1 sur chaque surface où il se pose.
 *
 * La table est confrontée à `globals.css` par `jetons-compiles.test.ts`.
 */
const THEMES = [
  ['clair', JETONS_CLAIR],
  ['sombre', JETONS_SOMBRE],
] as const;

const ENCRES = [
  { jeton: 'encre-douce', encre: 'foreground', alpha: 0.8, sur: 'card', surfaces: ['card', 'background', 'muted', 'popover'] },
  { jeton: 'encre-douce-inverse', encre: 'background', alpha: 0.7, sur: 'foreground', surfaces: ['foreground'] },
] as const;

describe.each(THEMES)('TCK-2685 — encres douces, thème %s', (_theme, jetons) => {
  it.each(ENCRES)('$jeton est opaque', ({ jeton }) => {
    expect(jetons[jeton], `${jeton} absent de la table`).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it.each(ENCRES)('$jeton est la composition de $encre à $alpha sur $sur', ({ jeton, encre, alpha, sur }) => {
    const attendu = composer(versRvb(jetons[encre]!), versRvb(jetons[sur]!), alpha);
    const reel = versRvb(jetons[jeton]!);
    for (const i of [0, 1, 2]) expect(Math.abs(reel[i]! - attendu[i]!), `${jeton}, canal ${i}`).toBeLessThanOrEqual(1);
  });

  it.each(ENCRES)('$jeton tient ≥ 4,5:1 sur chacune de ses surfaces', ({ jeton, surfaces }) => {
    for (const surface of surfaces) {
      const ratio = contraste(jetons[jeton]!, jetons[surface]!);
      expect(ratio, `${jeton} sur ${surface} : ${fmt(ratio)}`).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE);
    }
  });
});
