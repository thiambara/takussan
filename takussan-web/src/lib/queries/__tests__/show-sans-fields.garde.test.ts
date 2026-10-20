// @vitest-environment node
/**
 * P60.03 — garde : le front n'envoie aucun `fields[...]` à une route de détail (`show`).
 *
 * ## Le contrat
 *
 * Un `show` rend la ressource de détail entière ; `fields` (et `include`) ne valent que pour les
 * listes (`docs/spatie-query-builder.md`, « Sparse fieldsets »). Dix-huit `show` sur dix-neuf
 * ignoraient le `fields[...]` que le front leur envoyait : le paramètre était décoratif, et le
 * lecteur croyait à une réponse réduite qu'il ne recevait pas.
 *
 * ## Ce qu'elle refuse
 *
 * Une déclaration de premier niveau (fonction, hook, constante) qui appelle un chemin de détail
 * — `/api/<ressource>/${id}` suivi de la fin du gabarit, d'un `?` ou de `${requete(...)}` — et
 * qui contient aussi `fields`.
 *
 * ## Ce qu'elle ne voit pas
 *
 * Un chemin passé par une variable, ou des paramètres construits dans une autre déclaration que
 * celle qui appelle le chemin. Elle cherche une FORME : c'est un plancher.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = process.cwd();
const SRC = join(RACINE, 'src');

function sources(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return nom === '__tests__' ? [] : sources(chemin);
    return /\.(ts|tsx)$/.test(nom) && !/\.test\.tsx?$/.test(nom) ? [chemin] : [];
  });
}

/** Un chemin de détail : l'identifiant interpolé est le DERNIER segment du chemin. */
const CHEMIN_DE_DETAIL = /\/api\/[a-z0-9\-/]+\/\$\{[^}]+\}(?=`|\?|\$\{requete)/;
const DEBUT_DE_DECLARATION = /^(?:export\s|async\s+function\s|function\s|const\s|let\s)/;

/** Découpe un source en déclarations de premier niveau (une ligne en colonne 0 en ouvre une). */
function declarations(texte: string): string[] {
  const blocs: string[] = [];
  let courant: string[] = [];
  for (const ligne of texte.split('\n')) {
    if (DEBUT_DE_DECLARATION.test(ligne) && courant.length > 0) {
      blocs.push(courant.join('\n'));
      courant = [];
    }
    courant.push(ligne);
  }
  blocs.push(courant.join('\n'));
  return blocs;
}

/** Retire les commentaires : un `fields` cité dans un docblock n'est pas un paramètre envoyé. */
function sansCommentaires(bloc: string): string {
  return bloc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function fautifs(chemin: string, texte: string): string[] {
  return declarations(texte)
    .map(sansCommentaires)
    .filter((bloc) => CHEMIN_DE_DETAIL.test(bloc) && /\bfields\b/.test(bloc))
    .map((bloc) => `${chemin} : ${bloc.match(CHEMIN_DE_DETAIL)?.[0]}`);
}

const FICHIERS = sources(SRC).map((f) => ({
  chemin: relative(RACINE, f).split(sep).join('/'),
  texte: readFileSync(f, 'utf8'),
}));

describe('P60.03 — aucun `fields[...]` envoyé à un `show`', () => {
  it('reconnaît la forme qu’elle refuse (témoins)', () => {
    expect(FICHIERS.length).toBeGreaterThan(300);
    expect(
      fautifs('t.ts', "export function f() {\n  return fetch(`/api/leases/${id}?fields[leases]=id`);\n}\n"),
    ).toHaveLength(1);
    expect(
      fautifs(
        't.ts',
        'export function f() {\n  const qs = buildQueryString({ fields: { a: [] } });\n  return apiRequest(cheminApi`/api/a/${id}${requete(qs)}`);\n}\n',
      ),
    ).toHaveLength(1);
    // Une liste, ou une sous-ressource d'un détail, garde ses `fields`.
    expect(fautifs('t.ts', "export function f() {\n  return q('/api/leases', { fields: {} });\n}\n")).toEqual([]);
    expect(
      fautifs('t.ts', 'export function f() {\n  return q(cheminApi`/api/leases/${id}/chain`, { fields: {} });\n}\n'),
    ).toEqual([]);
  });

  it('aucune déclaration du code ne l’envoie', () => {
    const tous = FICHIERS.flatMap(({ chemin, texte }) => fautifs(chemin, texte));
    expect(tous).toEqual([]);
  });
});
