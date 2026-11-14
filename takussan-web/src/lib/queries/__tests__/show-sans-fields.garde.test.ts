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
 * Un chemin passé par une variable (un segment interpolé dans le gabarit, lui, est vu depuis
 * TCK-1384), ou des paramètres construits dans une autre déclaration que
 * celle qui appelle le chemin. Elle cherche une FORME : c'est un plancher.
 *
 * ## Une exception, une seule (TCK-2589, décision 1a)
 *
 * Le show de la fiche client (`/api/customers/${id}`) reçoit `fields[customers]` pour demander des
 * attributs CALCULÉS — prochaine action, relance, référent (TCK-2588) —, que l'API retire avant
 * spatie : la ressource revient entière, avec eux. L'exception ne vaut que si la déclaration envoie
 * `fields: { customers: [...ATTRIBUTS_CALCULES_DE_LA_FICHE] }` et rien d'autre, et que chaque nom de
 * cette constante (lue dans `lib/queries/customers.ts`) est dans `CustomerCommercialAttributes::FIELDS`
 * (lue dans l'API). Un nom de colonne glissé dans la constante, ou à côté d'elle, refait rougir.
 *
 * ## Et une seconde (TCK-2780)
 *
 * Le show du bail (`/api/leases/${id}`) borne le locataire de `include=tenant` par `fields[customers]` :
 * l'API le lit (`CustomerResource::champsDemandesDuBloc($request)` dans `LeaseController.php`) et ne
 * rend que `id` et les clés demandées. L'exception ne vaut que si la déclaration envoie
 * `fields: { customers: CHAMPS_DU_LOCATAIRE_… }` (une constante nommée ainsi) et rien d'autre en
 * `fields`, et que l'API lit toujours cette demande. Un autre show, une autre table, ou une API qui
 * cesserait de la lire refont rougir.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import { attributsCalcules, RACINE_DU_DEPOT } from './attributs-calcules-de-l-api';

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
// TCK-1384 (P138.04) — les segments avant l'identifiant peuvent être interpolés eux aussi
// (`/api/${api}/${id}`, la sonde de `ressource-de-detail.ts`), que l'ancien motif laissait passer.
const CHEMIN_DE_DETAIL = /\/api\/(?:[a-z0-9\-/]|\$\{[^}]+\})+\/\$\{[^}]+\}(?=`|\?|\$\{requete)/;
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

/** TCK-2589 — la seule forme admise : le show client, avec la constante des attributs calculés, seule. */
const SHOW_CLIENT = /\/api\/customers\/\$\{[^}]+\}(?=`|\?|\$\{requete)/;
const ENVOI_DES_CALCULES = /\bfields:\s*\{\s*customers:\s*\[\s*\.\.\.ATTRIBUTS_CALCULES_DE_LA_FICHE\s*\]\s*,?\s*\}/g;

/** Les noms de `ATTRIBUTS_CALCULES_DE_LA_FICHE`, lus dans la source (jamais importés : la garde lit le code). */
function nomsDeLaConstante(source: string): string[] | null {
  const bloc = /export const ATTRIBUTS_CALCULES_DE_LA_FICHE = \[([^\]]*)\]/.exec(source);
  return bloc ? [...bloc[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]) : null;
}

/** Les noms de la constante que l'API ne calcule pas : vide, l'exception vaut. */
function nomsNonCalcules(noms: readonly string[], calcules: readonly string[]): string[] {
  return noms.filter((n) => !calcules.includes(n));
}

/** TCK-2780 — la seconde forme admise : le show du bail, avec les seuls champs du locataire. */
const SHOW_BAIL = /\/api\/leases\/\$\{[^}]+\}(?=`|\?|\$\{requete)/;
const ENVOI_DU_LOCATAIRE = /\bfields:\s*\{\s*customers:\s*CHAMPS_DU_LOCATAIRE_[A-Z_]+\s*,?\s*\}/g;

/** L'API borne-t-elle encore le locataire du show du bail ? Un APPEL dans le contrôleur, pas un docblock. */
function bailLitLesChampsDuLocataire(php: string): boolean {
  return /CustomerResource::champsDemandesDuBloc\(\$request\)/.test(php.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''));
}

function excusee(bloc: string, constanteSaine: boolean, bailBorne: boolean): boolean {
  if (constanteSaine && SHOW_CLIENT.test(bloc)) {
    const reste = bloc.replace(ENVOI_DES_CALCULES, '');
    if (reste !== bloc && !/\bfields\b/.test(reste)) return true;
  }
  if (bailBorne && SHOW_BAIL.test(bloc) && !SHOW_CLIENT.test(bloc)) {
    const reste = bloc.replace(ENVOI_DU_LOCATAIRE, '');
    if (reste !== bloc && !/\bfields\b/.test(reste)) return true;
  }
  return false;
}

function fautifs(chemin: string, texte: string, constanteSaine = false, bailBorne = false): string[] {
  return declarations(texte)
    .map(sansCommentaires)
    .filter((bloc) => CHEMIN_DE_DETAIL.test(bloc) && /\bfields\b/.test(bloc) && !excusee(bloc, constanteSaine, bailBorne))
    .map((bloc) => `${chemin} : ${bloc.match(CHEMIN_DE_DETAIL)?.[0]}`);
}

const FICHIERS = sources(SRC).map((f) => ({
  chemin: relative(RACINE, f).split(sep).join('/'),
  texte: readFileSync(f, 'utf8'),
}));

// TCK-2589 — la constante de la fiche, lue dans la source, et les attributs que l'API calcule.
const noms = nomsDeLaConstante(readFileSync(join(SRC, 'lib', 'queries', 'customers.ts'), 'utf8'));
const calcules = attributsCalcules('customers');
const constanteSaine = noms !== null && noms.length > 0 && nomsNonCalcules(noms, calcules).length === 0;
// TCK-2780 — le contrôleur du bail, lu dans l'API.
const CONTROLEUR_DU_BAIL = readFileSync(join(RACINE_DU_DEPOT, 'takussan-api', 'app', 'Http', 'Controllers', 'Api', 'LeaseController.php'), 'utf8');
const bailBorne = bailLitLesChampsDuLocataire(CONTROLEUR_DU_BAIL);

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
    // TCK-1384 (P138.04) — un chemin dont la ressource est interpolée aussi.
    expect(
      fautifs('t.ts', 'export const f = cache(async () => {\n  return apiRequest(cheminApi`/api/${api}/${id}?fields[${table}]=id`);\n});\n'),
    ).toHaveLength(1);
    // Une liste, ou une sous-ressource d'un détail, garde ses `fields`.
    expect(fautifs('t.ts', "export function f() {\n  return q('/api/leases', { fields: {} });\n}\n")).toEqual([]);
    expect(
      fautifs('t.ts', 'export function f() {\n  return q(cheminApi`/api/leases/${id}/chain`, { fields: {} });\n}\n'),
    ).toEqual([]);
  });

  it('aucune déclaration du code ne l’envoie', () => {
    const tous = FICHIERS.flatMap(({ chemin, texte }) => fautifs(chemin, texte, constanteSaine, bailBorne));
    expect(tous).toEqual([]);
  });

  describe('TCK-2589 — l’exception du show client', () => {
    const declaration = (envoi: string) =>
      `export async function f() {\n  const qs = buildQueryString({ ${envoi}, include: ['tags'] });\n  return apiRequest(cheminApi\`/api/customers/\${id}\${requete(qs)}\`);\n}\n`;

    it('lit la constante et la trouve faite d’attributs calculés par l’API', () => {
      expect(calcules.length, 'CustomerCommercialAttributes::FIELDS n’est plus lue').toBeGreaterThan(0);
      expect(noms, 'ATTRIBUTS_CALCULES_DE_LA_FICHE n’est plus lue dans lib/queries/customers.ts').not.toBeNull();
      expect(noms?.length).toBeGreaterThan(0);
      expect(nomsNonCalcules(noms ?? [], calcules)).toEqual([]);
    });

    it('n’excuse que la constante, seule, vers le seul show client (témoins)', () => {
      expect(fautifs('t.ts', declaration('fields: { customers: [...ATTRIBUTS_CALCULES_DE_LA_FICHE] }'), true)).toEqual([]);
      // Une colonne à côté de la constante, une liste écrite à la main, un autre show : refusés.
      expect(fautifs('t.ts', declaration("fields: { customers: [...ATTRIBUTS_CALCULES_DE_LA_FICHE, 'first_name'] }"), true)).toHaveLength(1);
      expect(fautifs('t.ts', declaration("fields: { customers: ['next_action'] }"), true)).toHaveLength(1);
      expect(fautifs('t.ts', declaration('fields: { customers: [...ATTRIBUTS_CALCULES_DE_LA_FICHE], tags: [] }'), true)).toHaveLength(1);
      expect(
        fautifs('t.ts', declaration('fields: { customers: [...ATTRIBUTS_CALCULES_DE_LA_FICHE] }').replace('/api/customers/', '/api/leases/'), true),
      ).toHaveLength(1);
      // Une constante qui porterait un nom que l'API ne calcule pas retire l'exception.
      expect(fautifs('t.ts', declaration('fields: { customers: [...ATTRIBUTS_CALCULES_DE_LA_FICHE] }'), false)).toHaveLength(1);
      expect(nomsNonCalcules(['next_action', 'first_name'], ['next_action'])).toEqual(['first_name']);
    });
  });

  describe('TCK-2780 — l’exception du show du bail', () => {
    const declaration = (envoi: string, chemin = '/api/leases/') =>
      `export function f() {\n  return useApiQuery(k, cheminApi\`${chemin}\${id ?? 0}\`, { params: { include: ['tenant'], ${envoi} } });\n}\n`;

    it('lit l’appel dans le contrôleur du bail, pas un commentaire', () => {
      expect(bailBorne, 'LeaseController::show ne lit plus CustomerResource::champsDemandesDuBloc($request)').toBe(true);
      expect(bailLitLesChampsDuLocataire('// CustomerResource::champsDemandesDuBloc($request)\n')).toBe(false);
      expect(bailLitLesChampsDuLocataire('/** {@see CustomerResource::champsDemandesDuBloc($request)} */')).toBe(false);
    });

    it('n’excuse que les champs du locataire, seuls, vers le seul show du bail (témoins)', () => {
      expect(fautifs('t.ts', declaration('fields: { customers: CHAMPS_DU_LOCATAIRE_DU_CONTEXTE }'), false, true)).toEqual([]);
      // Une autre table, une liste écrite à la main, une table de plus, un autre show : refusés.
      expect(fautifs('t.ts', declaration('fields: { leases: CHAMPS_DU_LOCATAIRE_DU_CONTEXTE }'), false, true)).toHaveLength(1);
      expect(fautifs('t.ts', declaration("fields: { customers: ['id', 'first_name'] }"), false, true)).toHaveLength(1);
      expect(fautifs('t.ts', declaration("fields: { customers: CHAMPS_DU_LOCATAIRE_DU_CONTEXTE, leases: ['id'] }"), false, true)).toHaveLength(1);
      expect(fautifs('t.ts', declaration('fields: { customers: CHAMPS_DU_LOCATAIRE_DU_CONTEXTE }', '/api/bookings/'), false, true)).toHaveLength(1);
      // Une API qui ne borne plus le locataire retire l'exception.
      expect(fautifs('t.ts', declaration('fields: { customers: CHAMPS_DU_LOCATAIRE_DU_CONTEXTE }'), false, false)).toHaveLength(1);
    });
  });
});
