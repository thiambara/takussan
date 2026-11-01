#!/usr/bin/env node
/**
 * Garde de l'UNIFORMITÉ DES CHAMPS — TCK-2460.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE EMPÊCHE
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Relevé du 2026-11-01 sur 887 fichiers `.tsx` : sept hauteurs de `SelectTrigger`, dont `h-8`, `h-9`,
 * `h-10` et `h-11` côte à côte sur un même écran, environ 35 `<select>` natifs, 22 `<input>` natifs et
 * 4 `<textarea>` natifs. Le porteur l'a vu à l'œil ; ni le typage ni le lint ne pouvaient le voir :
 * `className="h-9"` est valide partout, et `twMerge` le fait gagner contre la primitive.
 *
 * Une hauteur de champ ne se décide qu'à deux endroits : la primitive (`components/ui/`, `h-10`) et la
 * portée de densité (`data-field-density="comfortable"`, `h-11`, `ui/field-density.ts`).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * LES DEUX CONTRÔLES
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 *   **A — la hauteur écrite chez l'appelant.** Un `<Input>`, `<SelectTrigger>` ou `<Textarea>` dont le
 *   `className` statique porte `h-<n>`. `min-h-*` reste permis sur `Textarea` : c'est une hauteur de
 *   départ pour un texte long, pas la taille d'un contrôle. `SelectTrigger size="sm"` reste le seul
 *   compact, et il passe par la primitive.
 *
 *   **B — le contrôle natif.** `<select>`, `<textarea>` et `<input>` de saisie texte hors de
 *   `components/ui/`. Restent permis : `checkbox`, `radio`, `file`, `hidden`, `range`, `color`, dont la
 *   forme n'est pas celle d'un champ. Un `<input>` sans `type` compte comme texte : c'est le défaut HTML.
 *
 * ⚠ Elle lit le texte source, pas l'arbre React : un `className` calculé par une variable lui échappe, et
 * c'est un plancher. Elle part des balises et non d'une liste de fichiers : un écran neuf est couvert le
 * jour où il est écrit.
 *
 * Toute exception se justifie dans `EXCEPTIONS`, et une exception qui ne sert plus fait rougir : une
 * tolérance qui ne se referme pas est une dette qui ne se voit plus.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(RACINE, 'takussan-web/src');

/**
 * `fichier` (depuis `takussan-web/src/`) → `{ compte, motif }`. Le compte est FIGÉ, dans les deux sens : un
 * second contrôle dans un fichier excusé ne passe pas sous l'excuse du premier.
 */
const EXCEPTIONS = new Map([
  ['components/public/AnonymousLeadDialog.tsx', { compte: 1, motif: 'pot de miel hors écran, sans apparence de champ' }],
  ['components/reports/ReportDialog.tsx', { compte: 1, motif: 'pot de miel hors écran, sans apparence de champ' }],
  ['components/search/SearchAutocomplete.tsx', { compte: 1, motif: 'combobox sans bordure : la coque porte le champ, thèmes barre de navigation et page' }],
]);

const NATIFS_PERMIS = new Set(['checkbox', 'radio', 'file', 'hidden', 'range', 'color']);

function* fichiers(dossier) {
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) {
      if (entree.name === '__tests__' || entree.name === 'node_modules') continue;
      yield* fichiers(chemin);
    } else if (entree.name.endsWith('.tsx') && !entree.name.includes('.test.')) {
      yield chemin;
    }
  }
}

/** La balise ouvrante complète : les `>` des fonctions fléchées et des `{…}` n'y mettent pas fin. */
function baliseOuvrante(source, debut) {
  let accolades = 0;
  let guillemet = null;
  for (let i = debut; i < source.length; i += 1) {
    const c = source[i];
    if (guillemet) {
      if (c === guillemet && source[i - 1] !== '\\') guillemet = null;
    } else if (c === '"' || c === "'" || c === '`') {
      guillemet = c;
    } else if (c === '{') {
      accolades += 1;
    } else if (c === '}') {
      accolades -= 1;
    } else if (c === '>' && accolades === 0) {
      return source.slice(debut, i + 1);
    }
  }
  return source.slice(debut);
}

const ligneDe = (source, index) => source.slice(0, index).split('\n').length;

/** Un commentaire qui cite `<select>` n'est pas un `<select>` : on le blanchit, sans décaler les lignes. */
const sansCommentaires = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\n]/g, ' '))
  .replace(/^\s*\/\/.*$/gm, '');

export function controler(brut) {
  const source = sansCommentaires(brut);
  const defauts = [];

  for (const m of source.matchAll(/<(Input|SelectTrigger|Textarea)(?=[\s/>])/g)) {
    const balise = baliseOuvrante(source, m.index);
    for (const cn of balise.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{cn\(([^)]*)\)\})/g)) {
      const classes = cn[1] ?? cn[2] ?? cn[3] ?? '';
      // `[&_x]:h-4` vise un descendant, et `sm:h-10` serait quand même une hauteur : seul `h-*` sans
      // sélecteur d'enfant compte. La frontière gauche exclut `min-h-`, `max-h-`, `size-`.
      const hauteur = classes.match(/(?:^|[\s"'`])((?:[a-z-]+:)*h-[\w.[\]-]+)/);
      if (hauteur) {
        defauts.push({ ligne: ligneDe(source, m.index), message: `<${m[1]}> porte « ${hauteur[1]} » : la hauteur vit dans la primitive` });
      }
    }
  }

  for (const m of source.matchAll(/<(select|textarea|input)(?=[\s/>])/g)) {
    const balise = baliseOuvrante(source, m.index);
    if (m[1] === 'input') {
      const type = balise.match(/\btype="([a-z-]+)"/)?.[1];
      const calcule = /\btype=\{/.test(balise);
      if (calcule || NATIFS_PERMIS.has(type)) continue;
    }
    defauts.push({ ligne: ligneDe(source, m.index), message: `<${m[1]}> natif : utiliser la primitive de components/ui` });
  }

  return defauts;
}

function principal() {
  const rouges = [];
  const utilisees = new Set();

  for (const chemin of fichiers(SRC)) {
    const relatif = relative(SRC, chemin).split(sep).join('/');
    if (relatif.startsWith('components/ui/')) continue;
    const defauts = controler(readFileSync(chemin, 'utf8'));
    if (defauts.length === 0) continue;
    if (EXCEPTIONS.get(relatif)?.compte === defauts.length) {
      utilisees.add(relatif);
      continue;
    }
    if (EXCEPTIONS.has(relatif)) utilisees.add(relatif);
    for (const d of defauts) rouges.push(`  ${relatif}:${d.ligne} — ${d.message}`);
  }

  for (const cle of EXCEPTIONS.keys()) {
    if (!utilisees.has(cle)) rouges.push(`  ${cle} — exception sans objet : la retirer d'EXCEPTIONS`);
  }

  if (rouges.length > 0) {
    console.error(`✗ Champs non uniformes (${rouges.length}) — TCK-2460 :\n${rouges.join('\n')}`);
    process.exit(1);
  }
  console.log('✓ Champs uniformes : hauteur dans les primitives, aucun contrôle natif de saisie.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) principal();
