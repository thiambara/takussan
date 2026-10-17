/**
 * LE GRAPHE CLIENT STATIQUE d’un module — TCK-743 (P33.02), TCK-744 (P33.03), TCK-745 (P33.06).
 *
 * Ce qu'une route fait entrer dans son graphe client est téléchargé avant le premier rendu
 * interactif. Ce module suit les imports STATIQUES depuis une entrée, comme le bundler :
 *
 * - un module `'use client'` ouvre le graphe client, et tout ce qu'il importe y entre ;
 * - un module serveur importé par un module serveur n'y entre pas ;
 * - un module `'use server'` importé côté client n'y apporte qu'une référence, pas son code ;
 * - `import type`, `export type` et `import()` (donc `next/dynamic`) ne sont pas suivis : c'est
 *   la frontière qu'un découpage pose.
 *
 * ⚠ C'est un plancher, pas la mesure : il ne voit pas ce que le bundler ajoute de lui-même, et un
 * import dont tous les noms ne servent qu'en type compte quand même (sur-approximation, le bon
 * sens de l'erreur pour une garde). La mesure se fait sur les `entryJSFiles` d'un build (méthode
 * de l'angle 33 du fichier de pistes, P33.05).
 */
import { readFileSync } from 'node:fs';

import ts from 'typescript';

import { nommer, resoudreImport } from './analyse-statique';

/** La directive de tête d'un module, s'il en porte une. */
function directive(source: ts.SourceFile): 'client' | 'server' | null {
  for (const instruction of source.statements) {
    if (!ts.isExpressionStatement(instruction) || !ts.isStringLiteral(instruction.expression)) break;
    if (instruction.expression.text === 'use client') return 'client';
    if (instruction.expression.text === 'use server') return 'server';
  }
  return null;
}

/** Les spécificateurs importés ou réexportés à l'exécution (les formes `type` sont écartées). */
function specificateurs(source: ts.SourceFile): string[] {
  const out: string[] = [];
  for (const instruction of source.statements) {
    if (ts.isImportDeclaration(instruction)) {
      if (instruction.importClause?.isTypeOnly) continue;
      if (ts.isStringLiteral(instruction.moduleSpecifier)) out.push(instruction.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(instruction) && instruction.moduleSpecifier) {
      if (instruction.isTypeOnly) continue;
      if (ts.isStringLiteral(instruction.moduleSpecifier)) out.push(instruction.moduleSpecifier.text);
    }
  }
  return out;
}

const paquet = (spec: string) =>
  spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!;

interface Graphe {
  /** Les modules du graphe client, nommés relativement à `src/`. */
  readonly modules: ReadonlySet<string>;
  /** Les paquets npm importés depuis le graphe client, avec le chemin d'imports qui y mène. */
  readonly paquets: ReadonlyMap<string, readonly string[]>;
}

function grapheClient(entree: string): Graphe {
  const modules = new Set<string>();
  const paquets = new Map<string, string[]>();
  const vus = new Set<string>();
  const pile: Array<{ fichier: string; client: boolean; chemin: string[] }> = [
    { fichier: entree, client: false, chemin: [] },
  ];
  while (pile.length > 0) {
    const { fichier, client: parent, chemin } = pile.pop()!;
    const source = ts.createSourceFile(fichier, readFileSync(fichier, 'utf8'), ts.ScriptTarget.Latest, false);
    const d = directive(source);
    if (parent && d === 'server') continue;
    const client = parent || d === 'client';
    const cle = `${client}:${fichier}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    const ici = [nommer(fichier), ...chemin];
    if (client) modules.add(nommer(fichier));
    for (const spec of specificateurs(source)) {
      if (spec.startsWith('.') || spec.startsWith('@/')) {
        const cible = resoudreImport(spec, fichier);
        if (cible) pile.push({ fichier: cible, client, chemin: ici });
      } else if (client) {
        const chemins = paquets.get(paquet(spec)) ?? [];
        chemins.push(ici.join(' ← '));
        paquets.set(paquet(spec), chemins);
      }
    }
  }
  return { modules, paquets };
}

/** Les modules (nommés relativement à `src/`) qu'une entrée fait entrer dans le graphe client. */
export function modulesDuGrapheClient(entree: string): ReadonlySet<string> {
  return grapheClient(entree).modules;
}

/**
 * Les paquets de `interdits` qu'atteint le graphe client de `entree`, chacun avec le chemin
 * d'imports qui l'y amène (`zod ← lib/schemas/x.ts ← components/Y.tsx ← app/page.tsx`).
 */
export function paquetsDuGrapheClient(entree: string, interdits: readonly string[]): string[] {
  const { paquets } = grapheClient(entree);
  return [
    ...new Set(interdits.flatMap((nom) => (paquets.get(nom) ?? []).map((chemin) => `${nom} ← ${chemin}`))),
  ].sort();
}
