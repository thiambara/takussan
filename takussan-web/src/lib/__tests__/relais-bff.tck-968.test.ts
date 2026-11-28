import ts from 'typescript';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * TCK-968 (P48.01) — tout `fetch('/api/…')` littéral du front vise un relais de `src/app/api/`.
 *
 * Un chemin relatif part sur l'origine du FRONT : `fetch('/api/leases')` atteint le serveur Next,
 * jamais Laravel (`takussan-web/CLAUDE.md`, « seconde moitié du piège »). Sans `route.ts` qui le
 * serve, la réponse est un 404, que les appelants avalaient en silence : la check-list d'entrée et
 * la modale de bienvenue du locataire ne s'affichaient jamais, et leurs tests, qui remplaçaient
 * `fetch` par un faux servant `/api/leases`, restaient verts.
 *
 * Ce test lit le CODE et l'ARBORESCENCE, pas un faux : il relève les littéraux, puis cherche le
 * `route.ts` que le routeur de Next choisirait. Il ne voit pas un chemin construit hors du littéral
 * (`fetch(url)`, `appelBff(BASE)`), ni les appels à Laravel par `apiRequest` (P45.01).
 *
 * TCK-3009 — les appels au BFF passent par `appelBff` (`src/lib/bff.ts`) : il ne restait que cinq `fetch`
 * littéraux, et le seuil de non-vacuité rougissait. Les deux sont relevés, par l'AST et non plus par une
 * expression régulière : un générique (`appelBff<{ data: Array<T> }>(…)`) et le gabarit étiqueté
 * `` cheminApi`/api/…/${id}` `` — la forme de la plupart des appels — passaient sous elle.
 */

const SRC = path.resolve(__dirname, '../..');
const API = path.join(SRC, 'app/api');
const DYNAMIQUE = '\u0000';

function fichiersSource(dossier: string): string[] {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = path.join(dossier, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : fichiersSource(chemin);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name) ? [chemin] : [];
  });
}

const APPELANTS = new Set(['fetch', 'appelBff']);

/** Le texte d'un chemin littéral, chaque `${…}` remplacé par {@link DYNAMIQUE} ; `null` s'il n'est pas littéral. */
function texteLitteral(argument: ts.Expression): string | null {
  if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) return argument.text;
  if (ts.isTemplateExpression(argument)) {
    return argument.head.text + argument.templateSpans.map((s) => DYNAMIQUE + s.literal.text).join('');
  }
  // `cheminApi` encode ses valeurs sans changer la forme du chemin : son gabarit se lit comme un gabarit.
  if (ts.isTaggedTemplateExpression(argument)) return texteLitteral(argument.template);
  return null;
}

/** Les chemins littéraux passés à `fetch` ou `appelBff`, `${…}` remplacé par un segment dynamique. */
function cheminsRelatifs(source: string): string[] {
  if (!source.includes('/api/')) return [];
  const fichier = ts.createSourceFile('source.tsx', source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  const chemins: string[] = [];
  const visiter = (noeud: ts.Node): void => {
    if (ts.isCallExpression(noeud) && ts.isIdentifier(noeud.expression) && APPELANTS.has(noeud.expression.text)) {
      const texte = noeud.arguments[0] ? texteLitteral(noeud.arguments[0]) : null;
      if (texte !== null && texte.startsWith('/api/')) chemins.push(texte.split(/[?#]/)[0]);
    }
    ts.forEachChild(noeud, visiter);
  };
  visiter(fichier);
  return chemins;
}

/**
 * Le `route.ts` qui servirait ce chemin, selon les conventions du routeur : segment exact avant
 * dynamique `[x]`, groupe `(x)` traversé sans consommer de segment, attrape-tout `[...x]` (au
 * moins un segment) et `[[...x]]` (zéro ou plus).
 */
function relaisExiste(chemin: string): boolean {
  const segments = chemin.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const descendre = (dossier: string, reste: string[]): boolean => {
    if (!fs.existsSync(dossier)) return false;
    const enfants = fs.readdirSync(dossier, { withFileTypes: true }).filter((e) => e.isDirectory());
    const sert = (e: fs.Dirent) => fs.existsSync(path.join(dossier, e.name, 'route.ts'));
    if (reste.length === 0) {
      if (fs.existsSync(path.join(dossier, 'route.ts'))) return true;
      if (enfants.some((e) => /^\[\[\.\.\..+\]\]$/.test(e.name) && sert(e))) return true;
    }
    if (enfants.filter((e) => /^\(.+\)$/.test(e.name)).some((e) => descendre(path.join(dossier, e.name), reste))) {
      return true;
    }
    if (reste.length === 0) return false;
    const [tete, ...queue] = reste;
    const estDynamique = tete.includes(DYNAMIQUE);
    const exact = estDynamique ? [] : enfants.filter((e) => e.name === tete);
    const parametres = enfants.filter((e) => /^\[(?!\.\.\.)(?!\[).+\]$/.test(e.name));
    const statiques = estDynamique ? enfants.filter((e) => !/^[[(]/.test(e.name)) : [];
    if ([...exact, ...parametres, ...statiques].some((e) => descendre(path.join(dossier, e.name), queue))) {
      return true;
    }
    return enfants.some((e) => /^\[\[?\.\.\..+\]\]?$/.test(e.name) && sert(e));
  };
  return descendre(API, segments);
}

describe('TCK-968 — un fetch relatif vers /api/ vise un relais du serveur Next', () => {
  it('le résolveur suit les conventions du routeur, dans les deux sens', () => {
    // Le pendant de non-vacuité : un résolveur complaisant rendrait vert n'importe quel appel.
    expect(relaisExiste('/api/me/welcome-seen'), 'route exacte').toBe(true);
    expect(relaisExiste('/api/agencies'), 'attrape-tout optionnel, zéro segment').toBe(true);
    expect(relaisExiste('/api/agencies/12/members'), 'attrape-tout optionnel').toBe(true);
    expect(relaisExiste('/api/super-admin/health'), 'attrape-tout').toBe(true);
    expect(relaisExiste('/api/me/agent-profiles/7/kyc/upload'), 'segment [id]').toBe(true);
    expect(relaisExiste(`/api/me/${DYNAMIQUE}/7/kyc/upload`), 'segment interpolé').toBe(true);
    expect(relaisExiste('/api/leases'), 'aucun relais').toBe(false);
    expect(relaisExiste('/api/me/nexiste-pas'), 'aucun relais sous me/').toBe(false);
    expect(relaisExiste('/api/super-admin'), 'attrape-tout obligatoire, zéro segment').toBe(false);
  });

  it('relève les littéraux, multilignes et gabarits compris', () => {
    expect(cheminsRelatifs("await fetch(\n  '/api/leases?filter[status]=active',\n  {}")).toEqual(['/api/leases']);
    expect(cheminsRelatifs('fetch(`/api/me/${id}/kyc`)')).toEqual([`/api/me/${DYNAMIQUE}/kyc`]);
    expect(cheminsRelatifs("apiFetch('/public/x'); fetch(API + '/api/x')")).toEqual([]);
    // TCK-3009 — la forme de la primitive : générique imbriqué, gabarit étiqueté, requête en suffixe.
    expect(cheminsRelatifs('appelBff<{ data: Array<string> }>(cheminApi`/api/leases/${id}${requete(qs)}`)')).toEqual([
      `/api/leases/${DYNAMIQUE}${DYNAMIQUE}`,
    ]);
    expect(cheminsRelatifs("appelBff('/api/me/profiles', { params })")).toEqual(['/api/me/profiles']);
    expect(cheminsRelatifs("apiRequest('/api/leases'); const s = 'appelBff(\\'/api/x\\')';")).toEqual([]);
  });

  it('aucun fetch ni appelBff littéral de src/ ne vise un chemin sans route.ts', () => {
    const appels = fichiersSource(SRC).flatMap((fichier) =>
      cheminsRelatifs(fs.readFileSync(fichier, 'utf8')).map((chemin) => ({
        fichier: path.relative(SRC, fichier),
        chemin,
      })),
    );
    // Non-vacuité : le relevé du 2026-10-19 comptait une soixantaine de `fetch` ; celui du 2026-11-28, après
    // TCK-3009, plus de deux cents appels (`appelBff` compris).
    expect(appels.length).toBeGreaterThan(150);
    // Témoin positif sur le vrai code : un appel de la primitive, en gabarit étiqueté, est bien relevé.
    expect(appels.some((a) => a.fichier === 'lib/queries/radar.ts' && a.chemin.startsWith('/api/super-admin/radar/'))).toBe(true);

    const orphelins = appels
      .filter(({ chemin }) => !relaisExiste(chemin))
      .map(({ fichier, chemin }) => `${fichier} → ${chemin.replaceAll(DYNAMIQUE, '${…}')}`);
    expect(orphelins, 'fetch relatif sans relais sous src/app/api/ : passer par apiRequest').toEqual([]);
  });
});
