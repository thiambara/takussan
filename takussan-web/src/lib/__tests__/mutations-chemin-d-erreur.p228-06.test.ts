import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * P228.06 (TCK-2220) — tout `x.mutate(` du front a un chemin d'erreur.
 *
 * Le `QueryClient` n'a ni `MutationCache` ni `onError` par défaut (`lib/query-client.ts`) : une
 * mutation lancée par `mutate()` sans `onError`, et dont l'écran ne lit pas l'erreur, échoue sans
 * un mot. L'angle 228 en a relevé 18 sur 133 appels (P228.01 à P228.05, corrigés).
 *
 * Ce test lit le CODE. Un appel `x.mutate(` a un chemin d'erreur si l'un de ces quatre points vaut :
 * - l'appel lui-même passe un `onError` ;
 * - le fichier lit `x.error` ou `x.isError` ;
 * - la déclaration `const x = …(…)` du fichier porte un `onError` ;
 * - `x` vient d'un crochet `useXxx` de `src/` dont la définition porte un `onError`.
 *
 * Il ne voit ni un `mutate` déstructuré, ni une erreur rattrapée autrement (`onSettled`) : ces cas
 * vont dans `EXCEPTIONS`, avec leur motif. `mutateAsync` n'est pas relevé (son rejet se rattrape
 * par `try`, angle 210).
 */

const SRC = path.resolve(__dirname, '../..');

/** `fichier relatif à src/ › variable` → motif. Une exception qui ne sert plus fait rougir. */
const EXCEPTIONS: Record<string, string> = {
  'components/admin/super/ImpersonationBanner.tsx › quitter':
    "`onSettled` quitte quoi qu'il arrive : le relais efface les cookies même sur un échec amont (relu par l'explorateur, angle 228).",
  'hooks/useApiQuery.ts › mutation': "exemple du docblock de `useApiMutation`, pas un appel.",
};

function fichiersSource(dossier: string): string[] {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = path.join(dossier, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : fichiersSource(chemin);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name) ? [chemin] : [];
  });
}

/** Le texte parenthésé (ou accoladé) qui s'ouvre à `ouvrante`, délimiteurs compris. */
function bloc(source: string, ouvrante: number): string {
  let profondeur = 0;
  for (let i = ouvrante; i < source.length; i++) {
    const c = source[i];
    if (c === '(' || c === '{' || c === '[') profondeur++;
    else if (c === ')' || c === '}' || c === ']') {
      profondeur--;
      if (profondeur === 0) return source.slice(ouvrante, i + 1);
    }
  }
  return source.slice(ouvrante);
}

/** Les crochets `export function useXxx(…)` dont le corps porte un `onError`. */
function crochetsAvecErreur(sources: string[]): Set<string> {
  const noms = new Set<string>();
  for (const source of sources) {
    for (const m of source.matchAll(/export function (use\w+)\s*\(/g)) {
      const parametres = m.index + m[0].length - 1;
      const debutCorps = source.indexOf('{', parametres + bloc(source, parametres).length);
      if (debutCorps >= 0 && /\bonError\b/.test(bloc(source, debutCorps))) noms.add(m[1]);
    }
  }
  return noms;
}

/**
 * Les variables `x` de `x.mutate(` qui n'ont aucun chemin d'erreur dans `source`. La portée d'un
 * appel va de la dernière déclaration `const x = …(` qui le précède jusqu'à la fonction de premier
 * niveau suivante : deux composants d'un même fichier nomment souvent tous deux `mutation`.
 */
function sansCheminDErreur(source: string, crochets: Set<string>): string[] {
  const muets: string[] = [];
  for (const m of source.matchAll(/\b([A-Za-z_$][\w$]*)\.mutate\(/g)) {
    const x = m[1];
    if (/\bonError\b/.test(bloc(source, m.index + m[0].length - 1))) continue;
    const decl = [
      ...source.slice(0, m.index).matchAll(new RegExp(`\\bconst\\s+${x}\\s*=\\s*([\\w$.]+)\\s*(?:<[^(]*>)?\\(`, 'g')),
    ].at(-1);
    const debut = decl?.index ?? 0;
    const suite = source.slice(m.index).search(/\n(?:export )?(?:async )?function /);
    const portee = source.slice(debut, suite < 0 ? source.length : m.index + suite);
    if (new RegExp(`\\b${x}\\.(error|isError)\\b`).test(portee)) continue;
    if (decl) {
      if (/\bonError\b/.test(bloc(source, decl.index + decl[0].length - 1))) continue;
      if (crochets.has(decl[1].split('.').pop() ?? '')) continue;
    }
    muets.push(x);
  }
  return muets;
}

describe('P228.06 — une mutation lancée par mutate() a un chemin d’erreur', () => {
  it('le relevé reconnaît les quatre chemins, et seulement eux', () => {
    const crochets = crochetsAvecErreur([
      'export function useAvecErreur(id: number) {\n  return useApiMutation({ path: `/api/x/${id}` }, { onError: () => {} });\n}',
      'export function useSansErreur() {\n  return useApiMutation({ path: "/api/y" }, { invalidate: [] });\n}',
    ]);
    expect([...crochets]).toEqual(['useAvecErreur']);

    expect(sansCheminDErreur('const a = useMutation({ mutationFn: f });\na.mutate();', crochets)).toEqual(['a']);
    expect(sansCheminDErreur('a.mutate(v, {\n  onError: (e) => dire(e),\n});', crochets)).toEqual([]);
    expect(sansCheminDErreur('a.mutate();\n{a.isError ? <p role="alert" /> : null}', crochets)).toEqual([]);
    expect(sansCheminDErreur('const a = useMutation({ mutationFn: f, onError: dire });\na.mutate();', crochets)).toEqual([]);
    expect(sansCheminDErreur('const a = useAvecErreur(3);\na.mutate();', crochets)).toEqual([]);
    expect(sansCheminDErreur('const a = useSansErreur();\na.mutate({ onSuccess: f });', crochets)).toEqual(['a']);
    // `b.isError` ne couvre pas `a`.
    expect(sansCheminDErreur('a.mutate();\nb.isError;', crochets)).toEqual(['a']);
    // Deux composants nomment `mutation` : l'`onError` du premier ne couvre pas le second.
    const deuxComposants = [
      'function Dialogue() {',
      '  const mutation = useMutation({ mutationFn: f, onError: dire });',
      '  mutation.mutate();',
      '  return mutation.error;',
      '}',
      'function Bouton() {',
      '  const mutation = useMutation({ mutationFn: g });',
      '  mutation.mutate();',
      '}',
    ].join('\n');
    expect(sansCheminDErreur(deuxComposants, crochets)).toEqual(['mutation']);
  });

  it('aucun mutate() de src/ n’échoue sans un mot', () => {
    const fichiers = fichiersSource(SRC).map((f) => ({
      relatif: path.relative(SRC, f).split(path.sep).join('/'),
      source: fs.readFileSync(f, 'utf8'),
    }));
    const crochets = crochetsAvecErreur(fichiers.map((f) => f.source));

    const appels = fichiers.reduce((n, f) => n + [...f.source.matchAll(/\b[A-Za-z_$][\w$]*\.mutate\(/g)].length, 0);
    // Non-vacuité : le relevé du 2026-10-24 comptait 133 appels.
    expect(appels).toBeGreaterThan(100);

    const muets = fichiers.flatMap((f) =>
      [...new Set(sansCheminDErreur(f.source, crochets))].map((x) => `${f.relatif} › ${x}`),
    );
    expect(
      muets.filter((cle) => !(cle in EXCEPTIONS)),
      "mutate() sans onError ni lecture de son erreur : dire le refus (useMessageErreurApi, ADR-0019), ou motiver une exception",
    ).toEqual([]);
    expect(
      Object.keys(EXCEPTIONS).filter((cle) => !muets.includes(cle)),
      'exception qui ne sert plus : la retirer',
    ).toEqual([]);
  });
});
