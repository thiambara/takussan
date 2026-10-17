import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { JETONS_CLAIR, SEUIL_NON_TEXTUEL, composer, contraste, fmt, versRvb } from '../contraste-wcag';

/**
 * TCK-753 (piste P07.09) — l'anneau de focus est plein, et le contour d'un champ se voit.
 *
 * `focus-visible:ring-ring/50` rendait 2,08:1 sur `--background` : sur un bouton plein, c'était le
 * seul signal de focus. `--input` (`#ebe5d5`), seul contour d'un champ, rendait 1,20:1 sur
 * `--background` et 1,26:1 sur `--card` (WCAG 2.2 §1.4.11 demande 3:1 aux deux).
 *
 * Jsdom n'a pas de moteur CSS : le test lit les FICHIERS. La valeur de `--input` est celle de
 * {@link JETONS_CLAIR}, que `jetons-compiles.test.ts` confronte à la compilation de `globals.css`.
 */

const RACINE = process.cwd();
const SRC = join(RACINE, 'src');

/** Un anneau ou un contour de la couleur `ring` atténué par l'opacité. */
const ANNEAU_TRANSLUCIDE = /\b(?:ring|outline)-ring\/\d+/g;

function sources(dir: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree);
    if (statSync(chemin).isDirectory()) {
      if (entree !== '__tests__') sources(chemin, acc);
    } else if (/\.(tsx?|css)$/.test(entree) && !/\.test\.tsx?$/.test(entree)) {
      acc.push(chemin);
    }
  }
  return acc;
}

describe('anneau de focus plein (TCK-753)', () => {
  it('le jeton plein tient 3:1, et la moitié ne le tenait pas', () => {
    const fond = JETONS_CLAIR.background;
    expect(contraste(JETONS_CLAIR.ring, fond)).toBeGreaterThanOrEqual(SEUIL_NON_TEXTUEL);
    expect(contraste(composer(versRvb(JETONS_CLAIR.ring), versRvb(fond), 0.5), fond))
      .toBeLessThan(SEUIL_NON_TEXTUEL);
  });

  it('aucun fichier de src/ ne pose un anneau ou un contour `ring` translucide', () => {
    const sites = sources(SRC).flatMap((fichier) => {
      const n = (readFileSync(fichier, 'utf8').match(ANNEAU_TRANSLUCIDE) ?? []).length;
      return n > 0 ? [`${relative(RACINE, fichier).split(sep).join('/')} (${n})`] : [];
    });
    expect(sites).toEqual([]);
  });
});

describe('contour des champs (TCK-753)', () => {
  it.each(['background', 'card'])('--input tient 3:1 sur --%s', (fond) => {
    const ratio = contraste(JETONS_CLAIR.input, JETONS_CLAIR[fond]);
    expect(ratio, `--input sur --${fond} : ${fmt(ratio)}`).toBeGreaterThanOrEqual(SEUIL_NON_TEXTUEL);
  });

  it('le fond d’un champ désactivé ne suit pas le contour assombri', () => {
    for (const primitive of ['input', 'textarea']) {
      const source = readFileSync(join(SRC, `components/ui/${primitive}.tsx`), 'utf8');
      expect(source, primitive).not.toMatch(/(?<!dark:)disabled:bg-input\b/);
    }
  });
});
