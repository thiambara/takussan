// @vitest-environment node
/**
 * TCK-2803 — garde : toute lecture de la LISTE des baux (`GET /api/leases`) qui demande le locataire
 * (`include` avec `'tenant'`) borne aussi son bloc par `fields[customers]`.
 *
 * ## Le contrat
 *
 * Depuis TCK-2803, la liste ne rend `tenant` que sous `include=tenant`, et `fields[customers]` le borne
 * à `id` et aux clés demandées (`LeaseController::index`, par `CustomerResource::champsDemandesDuBloc`).
 * Sans `fields[customers]`, le bloc revient ENTIER : e-mail, téléphone, profession… Un écran qui
 * nomme le locataire n'a pas à recevoir de quoi le joindre.
 *
 * ## Ce qu'elle voit, et ce qu'elle ne voit pas
 *
 * Une déclaration de premier niveau qui vise `/api/leases` (la liste : le chemin finit le gabarit, la
 * chaîne, ou est suivi d'un `?` ou de `${requete(`) et dont un `include: [...]` cite `'tenant'`. Un
 * `include` construit ailleurs, ou un chemin passé par une variable, lui échappent : c'est un plancher.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import { RACINE_DU_DEPOT } from './attributs-calcules-de-l-api';
import { CHAMPS_DU_LOCATAIRE_DE_L_AGENCE, CHAMPS_DU_LOCATAIRE_DU_LECTEUR } from '../leases-file';

const RACINE = process.cwd();
const SRC = join(RACINE, 'src');

function sources(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return nom === '__tests__' ? [] : sources(chemin);
    return /\.(ts|tsx)$/.test(nom) && !/\.test\.tsx?$/.test(nom) ? [chemin] : [];
  });
}

const DEBUT_DE_DECLARATION = /^(?:export\s|async\s+function\s|function\s|const\s|let\s)/;

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

function sansCommentaires(bloc: string): string {
  return bloc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** La LISTE des baux : `/api/leases` qui ferme le chemin (pas `/api/leases/…`). */
const CHEMIN_DE_LA_LISTE = /\/api\/leases(?=['"`?]|\$\{requete)/;
const INCLUT_LE_LOCATAIRE = /\binclude:\s*\[[^\]]*'tenant'/;
const BORNE_LE_LOCATAIRE = /\bcustomers:\s*(?:\[|CHAMPS_DU_LOCATAIRE_)/;

function fautifs(chemin: string, texte: string): string[] {
  return declarations(texte)
    .map(sansCommentaires)
    .filter((bloc) => CHEMIN_DE_LA_LISTE.test(bloc) && INCLUT_LE_LOCATAIRE.test(bloc) && !BORNE_LE_LOCATAIRE.test(bloc))
    .map((bloc) => `${chemin} : ${bloc.split('\n')[0]}`);
}

const FICHIERS = sources(SRC).map((f) => ({ chemin: relative(RACINE, f).split(sep).join('/'), texte: readFileSync(f, 'utf8') }));

describe('TCK-2803 — la liste des baux borne le locataire qu\'elle demande', () => {
  it('aucune lecture de la liste ne demande `tenant` sans `fields[customers]`', () => {
    expect(FICHIERS.flatMap(({ chemin, texte }) => fautifs(chemin, texte))).toEqual([]);
  });

  it('la garde voit au moins les trois lectures connues (elle ne s\'est pas vidée)', () => {
    const vues = FICHIERS.flatMap(({ chemin, texte }) =>
      declarations(texte).map(sansCommentaires).filter((b) => CHEMIN_DE_LA_LISTE.test(b) && INCLUT_LE_LOCATAIRE.test(b)).map(() => chemin),
    );
    expect(vues).toEqual(expect.arrayContaining(['src/lib/queries/leases-file.ts', 'src/lib/queries/inventory.ts']));
    expect(vues.filter((c) => c === 'src/lib/queries/leases-file.ts')).toHaveLength(2);
  });

  it('témoins : la garde refuse une liste qui demande le locataire sans le borner, et admet celle qui le borne', () => {
    const fautive = "export function f() {\n  return useApiQuery(['x'], '/api/leases', { params: { include: ['tenant', 'property'] } });\n}\n";
    const bornee = "export function f() {\n  return useApiQuery(['x'], '/api/leases', { params: { fields: { customers: ['id'] }, include: ['tenant'] } });\n}\n";
    const fiche = "export function f(id: number) {\n  return apiRequest(cheminApi`/api/leases/${id}/renew`, { include: ['tenant'] });\n}\n";
    expect(fautifs('x.ts', fautive)).toHaveLength(1);
    expect(fautifs('x.ts', bornee)).toEqual([]);
    expect(fautifs('x.ts', fiche)).toEqual([]);
  });

  it('les champs demandés sont ceux que les écrans lisent : jamais l\'e-mail, le téléphone pour la seule file de l\'agence', () => {
    expect([...CHAMPS_DU_LOCATAIRE_DE_L_AGENCE]).toEqual(['id', 'first_name', 'last_name', 'phone']);
    expect([...CHAMPS_DU_LOCATAIRE_DU_LECTEUR]).toEqual(['id', 'first_name', 'last_name']);
  });

  it("l'API borne toujours le bloc de la liste (un APPEL dans `index`, pas un docblock)", () => {
    const php = readFileSync(join(RACINE_DU_DEPOT, 'takussan-api', 'app', 'Http', 'Controllers', 'Api', 'LeaseController.php'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const index = /public function index\([\s\S]*?\n {4}}\n/.exec(php)?.[0] ?? '';
    expect(index).toMatch(/CustomerResource::champsDemandesDuBloc\(\$request\)/);
    expect(index).toMatch(/->avecLocataire\(/);
  });
});
