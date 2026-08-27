import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * TCK-381 · AC6 — **les jetons d'état existent dans `:root` ET dans `.dark`.**
 *
 * L'AC dit « et », et le « et » est tout le sujet. Le contexte du ticket le nomme : `globals.css`
 * déclarait déjà un bloc `.dark` complet, et pas une des 1070 occurrences de palette brute ne
 * basculait avec lui — *un thème qu'aucun écran ne peut suivre n'est pas un thème, c'est une
 * déclaration.* Porter `/app` sur des jetons ne vaut que si ces jetons ont bien DEUX valeurs ;
 * un jeton déclaré dans le seul `:root` reproduirait le défaut sous un autre nom, et rien à
 * l'exécution ne le dirait — une variable CSS absente ne casse rien, elle rend vide.
 *
 * ⚠ Ce test lit le FICHIER, délibérément, et n'instancie aucun composant : il n'existe pas de
 * moteur CSS dans jsdom, donc « la classe rend la bonne couleur » n'est pas éprouvable ici. Ce
 * qui l'est, et qui suffit à l'AC : la déclaration est présente des deux côtés, et exposée à
 * Tailwind par `@theme inline` — sans quoi `bg-success` ne compile simplement pas.
 */

const CSS = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

/** Le corps d'un bloc `:root { … }` ou `.dark { … }`, premier niveau d'accolades. */
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

const JETONS = [
  '--warning',
  '--warning-foreground',
  '--success',
  '--success-foreground',
  '--info',
  '--info-foreground',
] as const;

describe('AC6 — les jetons d’état de TCK-381', () => {
  const clair = bloc(':root');
  const sombre = bloc('.dark');

  it.each(JETONS)('%s est déclaré dans :root', (jeton) => {
    expect(clair).toMatch(new RegExp(`^\\s*${jeton}:\\s*\\S`, 'm'));
  });

  it.each(JETONS)('%s est REDÉCLARÉ dans .dark', (jeton) => {
    expect(sombre).toMatch(new RegExp(`^\\s*${jeton}:\\s*\\S`, 'm'));
  });

  it.each(JETONS)('%s a une valeur DIFFÉRENTE en sombre', (jeton) => {
    const lire = (source: string) =>
      new RegExp(`^\\s*${jeton}:\\s*([^;]+);`, 'm').exec(source)?.[1].trim();
    // Une redéclaration à l'identique passerait les deux cas ci-dessus en ne basculant rien :
    // c'est la forme d'échec exacte que ce ticket existe pour éteindre, écrite en jetons.
    expect(lire(sombre)).not.toBe(lire(clair));
  });

  it.each(JETONS)('%s est exposé à Tailwind par @theme inline', (jeton) => {
    const theme = bloc('@theme inline');
    expect(theme).toContain(`--color-${jeton.slice(2)}: var(${jeton});`);
  });

  /**
   * Le blanc FONCTIONNEL — repris de TCK-358, et la seule surface qui ne suit PAS le thème. Le
   * fond d'un QR code est un contraste machine, pas une surface : le porter sur `--card` le
   * rendrait illisible au téléphone en thème sombre.
   */
  it('garde `.qr-surface`, le seul blanc écrit en dur', () => {
    expect(CSS).toMatch(/\.qr-surface\s*\{\s*background-color:\s*#ffffff;/);
  });
});
