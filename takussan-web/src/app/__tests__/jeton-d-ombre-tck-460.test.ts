import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * TCK-460 · **une ombre a besoin d'un jeton qui ne s'inverse pas.**
 *
 * Deux cartes de bien écrivaient leur ombre en `rgba(31, 24, 18, …)` — la valeur de
 * `--foreground` recopiée à la main en décimal. Le remède ÉVIDENT (lire `--foreground`) casse
 * l'ombre sous `.dark`, où le jeton vaut `#fcf9f3` : l'ombre devient CLAIRE. Ce n'est pas une
 * conjecture, c'est mesuré — Chrome, `getComputedStyle().boxShadow`, sur la feuille compilée par
 * le Tailwind 4.2.2 du projet, le 2026-08-29 :
 *
 * | forme                                       | `:root`                       | `.dark`                       |
 * |---|---|---|
 * | `color-mix(…, var(--shadow-color) 8%, …)`   | `srgb .1216 .0941 .0706 /.08` | `srgb .1216 .0941 .0706 /.08` |
 * | `color-mix(…, var(--foreground) 8%, …)`     | `srgb .1216 .0941 .0706 /.08` | `srgb .9882 .9765 .9529 /.08` |
 *
 * La seconde ligne EST le piège, reproduit. La première est la propriété que ce fichier garde.
 *
 * ⚠ **Ce test lit le FICHIER, et c'est une limite assumée** : jsdom n'a pas de moteur CSS, donc
 * « l'ombre rend la bonne couleur » n'y est pas éprouvable. Ce qui l'est, et qui suffit à l'AC :
 * le jeton est déclaré une fois et **jamais redéclaré** — c'est cette ABSENCE qui porte la
 * non-inversion, et c'est elle qu'une ablation (ajouter `--shadow-color` sous `.dark`) fait
 * rougir ici.
 *
 * ⚠⚠ **La forme de l'appelant compte autant que le jeton.** `shadow-[…_var(--shadow-color)]`
 * serait vert pour tous les autres cas de ce fichier et rendrait une ombre **opaque** : le jeton
 * porte la couleur, pas l'alpha. D'où le cas « l'alpha est composé ».
 */

const RACINE = process.cwd();
const CSS = readFileSync(join(RACINE, 'src/app/globals.css'), 'utf8');

/** Les deux appelants, et les seuls — le balayage dérivé de `src/` n'en a pas trouvé d'autres. */
const APPELANTS = [
  'src/components/property/cards/PropertyCardListing.tsx',
  'src/components/property/cards/PropertyCardStandard.tsx',
] as const;

/** Le corps d'un bloc de premier niveau (`:root { … }`, `.dark { … }`). */
function bloc(selecteur: string): string {
  const debut = CSS.indexOf(`${selecteur} {`);
  expect(debut, `bloc « ${selecteur} » introuvable dans globals.css`).toBeGreaterThan(-1);
  let profondeur = 0;
  for (let i = CSS.indexOf('{', debut); i < CSS.length; i += 1) {
    if (CSS[i] === '{') profondeur += 1;
    else if (CSS[i] === '}') {
      profondeur -= 1;
      if (profondeur === 0) return CSS.slice(debut, i);
    }
  }
  throw new Error(`bloc « ${selecteur} » non refermé`);
}

/** La valeur d'un jeton dans une portion de feuille, `undefined` s'il n'y est pas déclaré. */
function valeur(source: string, jeton: string): string | undefined {
  return new RegExp(`^\\s*${jeton}:\\s*([^;]+);`, 'm').exec(source)?.[1].trim();
}

describe('TCK-460 — le jeton d’ombre', () => {
  it('AC1 · `--shadow-color` est déclaré dans `:root`', () => {
    expect(valeur(bloc(':root'), '--shadow-color')).toBe('#1f1812');
  });

  /**
   * LE CŒUR DE L'AC1. Une DÉCLARATION de plus, où que ce soit — `.dark`, un
   * `prefers-color-scheme`, un thème futur — et l'ombre redevient inversante. On compte donc les
   * déclarations dans le fichier ENTIER, pas seulement dans `.dark` : chercher au seul endroit
   * où on a peur du défaut, c'est laisser la porte d'à côté ouverte.
   */
  it('AC1 · il n’est DÉCLARÉ nulle part ailleurs — ni sous `.dark`, ni sous un `@media`', () => {
    const declarations = CSS.match(/^\s*--shadow-color:\s*[^;]+;/gm) ?? [];
    expect(
      declarations,
      'une seconde déclaration de `--shadow-color` rend l’ombre inversante : '
      + `trouvées → ${JSON.stringify(declarations)}`,
    ).toHaveLength(1);
    expect(valeur(bloc('.dark'), '--shadow-color')).toBeUndefined();
  });

  /**
   * Le témoin de ce que le jeton ÉVITE. `--foreground` bascule ; c'est vérifié ici pour que le
   * jour où quelqu'un propose « autant lire `--foreground` », le fichier lui réponde par une
   * mesure plutôt que par une opinion.
   */
  it('AC1 · le témoin — `--foreground`, lui, S’INVERSE bien', () => {
    expect(valeur(bloc(':root'), '--foreground')).toBe('#1f1812');
    expect(valeur(bloc('.dark'), '--foreground')).toBe('#fcf9f3');
  });

  /**
   * La justification du jeton PROPRE plutôt que de `--scrim` réemployé, écrite en assertion :
   * les deux valeurs diffèrent. Le jour où elles coïncideraient, ce test rougit et la
   * duplication devient à instruire — ce qui est exactement le bon moment pour la fusionner.
   */
  it('il ne double PAS `--scrim` : les deux valeurs diffèrent', () => {
    const racine = bloc(':root');
    expect(valeur(racine, '--scrim')).toBe('#000000');
    expect(valeur(racine, '--shadow-color')).not.toBe(valeur(racine, '--scrim'));
  });

  it.each(APPELANTS)('%s ne décide plus aucune couleur en valeur arbitraire', (chemin) => {
    const source = readFileSync(join(RACINE, chemin), 'utf8');
    // Le motif du contrôle D de `scripts/check-super-admin-tokens.mjs`, réduit à la forme qui
    // manquait : une fonction de couleur DANS une valeur arbitraire.
    expect(source).not.toMatch(/-\[[^\]]*(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/);
    expect(source).toContain('var(--shadow-color)');
  });

  /**
   * ⚠ LE CAS QUI SÉPARE « VERT » DE « VISIBLE ». Le jeton est OPAQUE : un appelant qui écrirait
   * `shadow-[0_8px_24px_var(--shadow-color)]` passerait tous les cas ci-dessus et peindrait une
   * ombre brune à 100 %. L'alpha doit donc être composé, et il ne peut l'être que par un
   * `color-mix` portant un pourcentage.
   */
  it.each(APPELANTS)('%s COMPOSE l’alpha, il ne pose pas le jeton nu', (chemin) => {
    const source = readFileSync(join(RACINE, chemin), 'utf8');
    const ombres = source.match(/shadow-\[[^\]]*\]/g) ?? [];
    expect(ombres.length).toBeGreaterThan(0);
    for (const ombre of ombres) {
      expect(
        ombre,
        `« ${ombre} » pose le jeton sans opacité : l’ombre rendrait à 100 %`,
      ).toMatch(/color-mix\(in_srgb,var\(--shadow-color\)_\d+%,transparent\)/);
    }
  });
});
