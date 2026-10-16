import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  JETONS_CLAIR,
  JETONS_SOMBRE,
  SEUIL_AA_TEXTE,
  type Rvb,
  composer,
  contraste,
  fmt,
  litUtilitaireDeCouleur,
  versRvb,
} from '@/test/contraste-wcag';

/**
 * TCK-657 (piste P07.01) — deux encres de la recherche publique tiennent 4,5:1, dans les deux
 * thèmes.
 *
 * 1. **La pastille de prix de la carte** (`.takussan-price-marker__pill`, `globals.css`) : du texte
 *    de 12 px, donc du texte normal (WCAG 2.2 §1.4.3). Elle recopiait `#c87a52` et `#b66c43` en
 *    dur, à 3,14:1 au repos et 3,83:1 au survol sous l'encre `#fcf9f3`.
 * 2. **Le surlignage des suggestions** (`<mark>` de `SearchAutocomplete.tsx`) : `text-primary` sur
 *    `bg-primary/15`, à 4,33:1 sur la carte blanche du menu.
 *
 * Le test lit les deux FICHIERS : jsdom n'a pas de moteur CSS. Il résout chaque `var(--x)` par les
 * tables de `contraste-wcag.ts`, que `jetons-compiles.test.ts` garde égales à `globals.css`, et
 * LÈVE sur une valeur qu'il ne sait pas résoudre plutôt que de la mesurer contre un repli.
 */

const RACINE = process.cwd();
const CSS = readFileSync(join(RACINE, 'src/app/globals.css'), 'utf8');
const AUTOCOMPLETE = readFileSync(
  join(RACINE, 'src/components/search/SearchAutocomplete.tsx'),
  'utf8',
);

const THEMES = [
  ['clair', JETONS_CLAIR],
  ['sombre', JETONS_SOMBRE],
] as const;

/** Le corps de la PREMIÈRE règle dont le sélecteur commence exactement par `selecteur`. */
function regle(selecteur: string): string {
  const debut = CSS.indexOf(`${selecteur}`);
  expect(debut, `règle « ${selecteur} » introuvable dans globals.css`).toBeGreaterThan(-1);
  const ouverture = CSS.indexOf('{', debut);
  return CSS.slice(ouverture + 1, CSS.indexOf('}', ouverture));
}

function propriete(corps: string, nom: string): string {
  const m = new RegExp(`(?:^|[;\\s])${nom}\\s*:\\s*([^;]+);`).exec(corps);
  expect(m, `propriété « ${nom} » absente`).not.toBeNull();
  return m![1].trim();
}

/** `var(--primary)` → la valeur du thème ; un littéral hexadécimal reste tel quel. */
function resoudre(valeur: string, jetons: Readonly<Record<string, string>>): string {
  const v = /^var\(--([a-z-]+)\)$/.exec(valeur);
  if (!v) {
    if (!/^#[0-9a-f]{6}$/i.test(valeur)) throw new Error(`valeur non résolue : « ${valeur} »`);
    return valeur;
  }
  const hex = jetons[v[1]];
  if (hex === undefined) throw new Error(`jeton de couleur inconnu : « ${v[1]} »`);
  return hex;
}

describe('pastille de prix de la carte', () => {
  const repos = regle('.takussan-price-marker__pill {');
  const survol = regle('.takussan-price-marker__pill:hover');

  for (const [theme, jetons] of THEMES) {
    it(`encre sur fond ≥ 4,5:1 au repos, thème ${theme}`, () => {
      const ratio = contraste(
        resoudre(propriete(repos, 'color'), jetons),
        resoudre(propriete(repos, 'background'), jetons),
      );
      expect(ratio, `${theme} : ${fmt(ratio)}`).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE);
    });

    it(`encre sur fond ≥ 4,5:1 au survol et au focus, thème ${theme}`, () => {
      // Le survol ne redéclare pas l'encre : c'est celle du repos qui s'y pose.
      const ratio = contraste(
        resoudre(propriete(repos, 'color'), jetons),
        resoudre(propriete(survol, 'background'), jetons),
      );
      expect(ratio, `${theme} : ${fmt(ratio)}`).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE);
    });
  }
});

describe('surlignage des suggestions de recherche', () => {
  const marques = [...AUTOCOMPLETE.matchAll(/<mark className="([^"]+)"/g)].map((m) => m[1]);

  it('un seul <mark>, à className littérale (sans quoi ce test ne lirait rien)', () => {
    expect(marques).toHaveLength(1);
  });

  const classes = (marques[0] ?? '').split(/\s+/);

  /** `text-primary`, ou la forme arbitraire `text-[var(--primary-deep)]`. */
  function encre(): string {
    const arbitraire = classes
      .map((c) => /^text-\[var\(--([a-z-]+)\)\]$/.exec(c)?.[1])
      .find(Boolean);
    if (arbitraire) return arbitraire;
    const jeton = classes.map((c) => litUtilitaireDeCouleur(c, 'text')).find((l) => l !== null);
    expect(jeton, 'aucune encre sur le <mark>').toBeTruthy();
    return jeton!.jeton;
  }

  function fond(): { jeton: string; alpha: number } {
    const lu = classes.map((c) => litUtilitaireDeCouleur(c, 'bg')).find((l) => l !== null);
    expect(lu, 'aucun fond sur le <mark>').toBeTruthy();
    return lu!;
  }

  // Le menu est en `bg-card` ; la ligne active y pose `bg-primary/8`, la ligne survolée
  // `bg-muted/50`. Le `<mark>` translucide se compose sur chacune.
  const LIGNES: ReadonlyArray<readonly [string, string, number]> = [
    ['ligne au repos', 'card', 0],
    ['ligne active', 'primary', 0.08],
    ['ligne survolée', 'muted', 0.5],
  ];

  for (const [theme, jetons] of THEMES) {
    for (const [ligne, teinte, alpha] of LIGNES) {
      it(`encre sur aplat ≥ 4,5:1, ${ligne}, thème ${theme}`, () => {
        const carte = versRvb(jetons.card);
        const sousLeMark: Rvb =
          alpha === 0 ? carte : composer(versRvb(resoudre(`var(--${teinte})`, jetons)), carte, alpha);
        const f = fond();
        const aplat = composer(versRvb(resoudre(`var(--${f.jeton})`, jetons)), sousLeMark, f.alpha);
        const ratio = contraste(resoudre(`var(--${encre()})`, jetons), aplat);
        expect(ratio, `${theme}, ${ligne} : ${fmt(ratio)}`).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE);
      });
    }
  }
});
