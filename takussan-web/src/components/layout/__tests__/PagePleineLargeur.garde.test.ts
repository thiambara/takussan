/**
 * TCK-2691 (ADR-0106, C1, AC7) — LA GARDE DE LA PLEINE LARGEUR.
 *
 * Une page qui adopte la pleine largeur (`<PagePleineLargeur>`) retire, au téléphone, la marge de
 * l'enveloppe de la coque : c'est elle qui pose ses marges, élément par élément. Poser une marge
 * latérale sur SON CONTENEUR (`px-4`, `p-4`, `pl-*`, `pr-*`, `ps-*`, `pe-*`, `mx-*`) la rétablit, et
 * une rangée qui porte déjà son `px-4` se retrouve à 32 px du bord : la seconde marge que la pleine
 * largeur existe pour retirer. Ce fichier rougit sur chacune.
 *
 * Deux moitiés :
 * 1. la RÈGLE CSS de l'enveloppe, compilée par le Tailwind du dépôt : sous `md`, `:has([data-pleine-largeur])`
 *    ramène la marge à zéro (jsdom n'applique pas de feuille : c'est la feuille compilée qui est lue) ;
 * 2. le BALAYAGE des sources : chaque `<PagePleineLargeur …>` de `src/` est lu, et son conteneur ne doit
 *    porter aucune marge latérale. Le balayage exige au moins une page qui l'adopte (la vitrine) : un
 *    balayage qui ne trouve rien ne garde rien.
 */
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { describe, expect, it } from 'vitest';

import { ENVELOPPE_DU_CONTENU } from '../PagePleineLargeur';

const ICI = dirname(fileURLToPath(import.meta.url));
const SRC = join(ICI, '..', '..', '..');
const GLOBALS = join(SRC, 'app', 'globals.css');

/** Les balises ouvrantes `<PagePleineLargeur …>` d'une source, accolades et chaînes comprises. */
export function balisesDAdoption(source: string): string[] {
  const balises: string[] = [];
  let depart = source.indexOf('<PagePleineLargeur');
  while (depart >= 0) {
    // Une mention dans un commentaire (« une page qui rend `<PagePleineLargeur>` ») n'est pas une adoption.
    const ligne = source.slice(source.lastIndexOf('\n', depart) + 1, depart);
    if (/^\s*\*|\/\/|\/\*|`/.test(ligne)) {
      depart = source.indexOf('<PagePleineLargeur', depart + 1);
      continue;
    }
    let profondeur = 0;
    let guillemet: string | null = null;
    let i = depart + 1;
    for (; i < source.length; i++) {
      const c = source[i];
      if (guillemet) {
        if (c === guillemet && source[i - 1] !== '\\') guillemet = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') guillemet = c;
      else if (c === '{') profondeur++;
      else if (c === '}') profondeur--;
      else if (c === '>' && profondeur === 0) break;
    }
    balises.push(source.slice(depart, i + 1));
    depart = source.indexOf('<PagePleineLargeur', i);
  }
  return balises;
}

/**
 * Les classes de marge latérale d'une balise : padding (`p`, `px`, `ps`, `pe`, `pl`, `pr`) non nul et
 * marge horizontale (`mx`, `ms`, `me`, `ml`, `mr`, négative comprise) hors `auto`, à toute variante.
 */
export function margesLaterales(balise: string): string[] {
  const motif = /(?<=^|[\s"'`{(])(?:[\w[\]&>():.-]+:)*-?(?:p|px|ps|pe|pl|pr|mx|ms|me|ml|mr)-[\w.[\]/()*+-]+/g;
  return (balise.match(motif) ?? []).filter((c) => !/-(?:0|auto)$/.test(c));
}

function sources(dossier: string, sortie: string[] = []): string[] {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) {
      if (nom === '__tests__' || nom === 'node_modules' || chemin.includes(join('playground', 'maquettes'))) continue;
      sources(chemin, sortie);
    } else if (nom.endsWith('.tsx')) sortie.push(chemin);
  }
  return sortie;
}

describe('TCK-2691 (C1) — la règle de l’enveloppe, compilée', () => {
  it('sous `md`, une page « pleine largeur » ramène la marge de l’enveloppe à zéro ; dès `md`, rien ne change', async () => {
    const dossier = mkdtempSync(join(tmpdir(), 'takussan-tw-pleine-largeur-'));
    const contenu = join(dossier, 'contenu.html');
    writeFileSync(contenu, `<div class="${ENVELOPPE_DU_CONTENU}"></div>`);
    const css = readFileSync(GLOBALS, 'utf8');
    const source = [
      '@import "tailwindcss" source(none);',
      `@source "${contenu}";`,
      css.split('\n').filter((l) => !/^@import\s+"tailwindcss"/.test(l)).join('\n'),
    ].join('\n');
    const compile = (await postcss([tailwind()]).process(source, { from: GLOBALS })).css;
    // Tailwind v4 émet la règle imbriquée : `.max-md\:has-…\:p-0 { @media (width < 48rem) { &:has(…) { … } } }`.
    const i = compile.indexOf('.max-md\\:has-\\[\\[data-pleine-largeur\\]\\]\\:p-0');
    expect(i).toBeGreaterThan(-1);
    const regle = compile.slice(i, compile.indexOf('}', i) + 1);
    // Sous `md` seulement (48rem), par `:has()`, et la marge entière (horizontale et verticale).
    expect(regle).toMatch(/@media \(width < 48rem\)/);
    expect(regle).toMatch(/&:has\([^)]*\[data-pleine-largeur\]/);
    expect(regle).toMatch(/padding: calc\(var\(--spacing\) \* 0\);/);
  }, 60_000);
});

describe('TCK-2691 (C1, AC7) — aucune page « pleine largeur » n’empile une seconde marge', () => {
  it('le détecteur voit la seconde marge : `px-4`, `p-4`, `md:px-6`, `-mx-4` rougissent ; `p-0`, `mx-auto`, `space-y-4` non', () => {
    // L'ablation de la garde, écrite une fois pour toutes : un détecteur aveugle ferait passer le balayage.
    expect(margesLaterales('<PagePleineLargeur className="space-y-4 px-4">')).toEqual(['px-4']);
    expect(margesLaterales('<PagePleineLargeur className={cn("p-4", ok && "md:px-6")}>')).toEqual(['p-4', 'md:px-6']);
    expect(margesLaterales('<PagePleineLargeur className="-mx-4 pl-3">')).toEqual(['-mx-4', 'pl-3']);
    expect(margesLaterales('<PagePleineLargeur className="p-0 mx-auto max-w-3xl space-y-4 pb-6">')).toEqual([]);
  });

  it('le balayage lit chaque balise, accolades et flèches comprises — et ignore une mention en commentaire', () => {
    const source = 'x <PagePleineLargeur className={cn("a", f(() => 1 > 0) && "px-4")} data-x="y">\n<p /></PagePleineLargeur>';
    expect(balisesDAdoption(source)).toEqual(['<PagePleineLargeur className={cn("a", f(() => 1 > 0) && "px-4")} data-x="y">']);
    expect(balisesDAdoption(' * une page qui rend `<PagePleineLargeur>` l’adopte\n// <PagePleineLargeur className="px-4">')).toEqual([]);
  });

  it('chaque page de `src/` qui l’adopte laisse son conteneur sans marge latérale', () => {
    const adoptions: { fichier: string; balise: string }[] = [];
    for (const fichier of sources(SRC)) {
      const texte = readFileSync(fichier, 'utf8');
      if (!texte.includes('<PagePleineLargeur')) continue;
      for (const balise of balisesDAdoption(texte)) adoptions.push({ fichier: relative(SRC, fichier), balise });
    }
    // Au moins la vitrine : un balayage qui ne trouve rien ne garde rien.
    expect(adoptions.length).toBeGreaterThan(0);
    const fautes = adoptions
      .map(({ fichier, balise }) => ({ fichier, marges: margesLaterales(balise) }))
      .filter((f) => f.marges.length > 0)
      .map((f) => `${f.fichier} : ${f.marges.join(' ')}`);
    expect(fautes).toEqual([]);
  });
});
