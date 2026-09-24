/**
 * La couleur d'une classe Tailwind TELLE QU'UN NAVIGATEUR LA RETIENT — compilée par le Tailwind du
 * dépôt avec le `@theme inline` de `globals.css`, puis évaluée jeton par jeton contre `:root` et
 * `.dark` (TCK-561, vérification adverse).
 *
 * Pourquoi ce module : les gardes de TCK-561 lisaient des CHAÎNES de classes. Un fond écrit
 * `…var(--background)/0` (déclaration rejetée par le navigateur, donc aucun fond) ou un jeton
 * renommé dans `globals.css` (`bg-scrim/10` compilé vers un `var(--scrim)` qui n'existe plus : voile
 * invisible) les laissaient vertes. Ici, une valeur que l'évaluateur ne sait pas lire, ou un jeton
 * absent, LÈVE — jamais supposé opaque ni présent.
 *
 * Il vit sous `__tests__/` (et non à côté de `contraste-wcag.ts`) parce que ses messages d'échec
 * sont du texte : hors de `__tests__`, `check-i18n` les compterait comme libellés d'interface.
 *
 * Ce qu'il ne fait pas : la couleur elle-même (teinte, contraste) — c'est `contraste-wcag.ts`.
 * Il ne rend que l'OPACITÉ, ce qui suffit à dire « visible » ou « transparent ».
 */
import { compile } from 'tailwindcss';
import fs from 'node:fs';
import path from 'node:path';

// `COULEUR_COMPILEE_GLOBALS` ne sert qu'à l'ABLATION : faire lire une copie altérée de la feuille
// (jeton renommé) sans toucher à celle du dépôt, que le serveur de développement recharge en direct.
const GLOBALS = fs.readFileSync(
  process.env.COULEUR_COMPILEE_GLOBALS ?? path.join(process.cwd(), 'src/app/globals.css'),
  'utf8',
);

/** Le bloc qui s'ouvre à `entete` (accolades équilibrées), sans l'en-tête. */
function bloc(source: string, entete: string): string {
  const debut = source.indexOf(entete);
  if (debut < 0) throw new Error(`« ${entete} » absent de globals.css`);
  let profondeur = 0;
  for (let i = source.indexOf('{', debut); i < source.length; i++) {
    if (source[i] === '{') profondeur++;
    else if (source[i] === '}' && --profondeur === 0) return source.slice(source.indexOf('{', debut) + 1, i);
  }
  throw new Error(`bloc « ${entete} » non refermé`);
}

/** Les propriétés personnalisées déclarées au premier niveau d'un bloc. */
export function jetonsDe(corps: string): Record<string, string> {
  const sansCommentaires = corps.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Record<string, string> = {};
  for (const m of sansCommentaires.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

export const RACINE = jetonsDe(bloc(GLOBALS, ':root {'));
export const SOMBRE = { ...RACINE, ...jetonsDe(bloc(GLOBALS, '.dark {')) };

/** Découpe aux virgules de premier niveau. */
function operandes(liste: string): string[] {
  const out: string[] = [];
  let profondeur = 0;
  let courant = '';
  for (const c of liste) {
    if (c === '(') profondeur++;
    if (c === ')') profondeur--;
    if (c === ',' && profondeur === 0) {
      out.push(courant.trim());
      courant = '';
    } else courant += c;
  }
  out.push(courant.trim());
  return out;
}

/**
 * L'opacité d'une valeur de couleur CSS, résolue contre `jetons`. LÈVE sur tout ce qu'elle ne
 * sait pas lire : une valeur illisible est, pour le navigateur, une déclaration rejetée.
 */
export function opacite(valeur: string, jetons: Record<string, string>, profondeur = 0): number {
  if (profondeur > 10) throw new Error(`jetons circulaires : ${valeur}`);
  const v = valeur.trim();
  const variable = v.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (variable) {
    const cible = jetons[variable[1]];
    if (cible === undefined) throw new Error(`jeton inconnu : ${variable[1]}`);
    return opacite(cible, jetons, profondeur + 1);
  }
  if (v === 'transparent') return 0;
  const hex = v.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    const h = hex[1];
    if (h.length === 3 || h.length === 6) return 1;
    if (h.length === 4) return parseInt(h[3] + h[3], 16) / 255;
    if (h.length === 8) return parseInt(h.slice(6), 16) / 255;
  }
  const fonction = v.match(/^(rgba?|hsla?|oklch|oklab|lab|lch|color)\((.*)\)$/);
  if (fonction) {
    const alpha = fonction[2].match(/\/\s*([\d.]+)(%?)\s*$/);
    if (!alpha) return 1;
    return alpha[2] ? Number(alpha[1]) / 100 : Number(alpha[1]);
  }
  const melange = v.match(/^color-mix\(\s*in\s+[\w-]+\s*,(.*)\)$/);
  if (melange) {
    const [a, b, ...reste] = operandes(melange[1]);
    if (!a || !b || reste.length) throw new Error(`color-mix illisible : ${v}`);
    const lire = (op: string) => {
      const m = op.match(/^(.*?)(?:\s+([\d.]+)%)?$/)!;
      return { couleur: m[1], part: m[2] === undefined ? undefined : Number(m[2]) / 100 };
    };
    const x = lire(a);
    const y = lire(b);
    const px = x.part ?? (y.part === undefined ? 0.5 : 1 - y.part);
    const py = y.part ?? 1 - px;
    const somme = px + py;
    return ((opacite(x.couleur, jetons, profondeur + 1) * px + opacite(y.couleur, jetons, profondeur + 1) * py) / somme) * Math.min(1, somme);
  }
  throw new Error(`valeur de couleur illisible : ${v}`);
}

async function compiler(): Promise<{ build: (c: string[]) => string }> {
  const theme = `@theme inline {${bloc(GLOBALS, '@theme inline {')}}`;
  return compile(`@import "tailwindcss";\n@custom-variant dark (&:is(.dark *));\n${theme}`, {
    base: process.cwd(),
    loadStylesheet: async () => {
      const p = path.join(process.cwd(), 'node_modules/tailwindcss/index.css');
      return { path: p, base: path.dirname(p), content: fs.readFileSync(p, 'utf8') };
    },
  });
}

/**
 * Le CSS compilé d'un ensemble de classes, dans l'ordre d'émission de Tailwind — pour les gardes
 * de GÉOMÉTRIE (`components/compare/__tests__/boite-compilee.ts`, TCK-577). Un compilateur neuf à
 * chaque appel : `build()` accumule les candidats d'un appel à l'autre.
 */
export async function cssCompile(classes: readonly string[]): Promise<string> {
  return (await compiler()).build([...classes]);
}

/**
 * La déclaration qu'un navigateur récent RETIENT pour une classe : la dernière du bloc (Tailwind
 * émet d'abord un repli sans `color-mix`, puis la vraie valeur sous `@supports`).
 */
export async function declaration(classe: string, propriete: string): Promise<{ valeur: string; sombre: boolean } | null> {
  const css = (await compiler()).build([classe]);
  const couche = css.slice(css.indexOf('@layer utilities'));
  const valeurs = [...couche.matchAll(new RegExp(`${propriete}\\s*:\\s*([^;]+);`, 'g'))].map((m) => m[1].trim());
  if (!valeurs.length) return null;
  return { valeur: valeurs.at(-1)!, sombre: couche.includes(':is(.dark *)') };
}

