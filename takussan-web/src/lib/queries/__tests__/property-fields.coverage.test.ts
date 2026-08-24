import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DASHBOARD_PROPERTY_FIELDS,
  DASHBOARD_PROPERTY_DETAIL_FIELDS,
} from '../properties-server';
import { ADMIN_PROPERTY_FIELDS } from '../super-admin';
import { CONVERSATION_PROPERTY_FIELDS } from '../conversations';

/**
 * Garde de COUVERTURE des `fields[properties]` du front (TCK-336).
 *
 * ## Le défaut qu'elle existe pour voir
 *
 * TCK-336 rend `PropertyResource` honnête : sous `fields[properties]=…`, une colonne non
 * demandée cesse d'être **fabriquée** (`price => 0`, `status => null`) pour devenir
 * **absente**. Tant que la ressource sur-livrait, un composant pouvait lire une colonne
 * que sa requête ne demandait pas sans que rien ne le signale — ni TypeScript (la réponse
 * est du JSON typé à la main), ni un test (les tests existants comparent l'URL à la
 * constante, donc ils restent verts quoi qu'elle contienne). Le jour où la ressource
 * filtre, cette lecture rend `undefined` **en production, en silence**.
 *
 * ⚠ Les deux tests qui existaient déjà — `properties.test.ts` et
 * `super-admin-properties.test.ts` — assertent
 * `url).toContain(fields[properties]=${LISTE.join(',')})`. Ils prouvent que la liste est
 * transmise ; ils ne prouvent **rien** sur son contenu. Retirer une colonne de la liste
 * les laisse verts. Ce sont des cases, pas des critères ; ce fichier est le critère.
 *
 * ## Ce qu'elle vérifie, et sur quelles sources
 *
 * Rien n'est recopié à la main : les quatre ensembles sont LUS à l'exécution.
 *
 * 1. les colonnes demandables → `Property::$queryFields` (PHP) ;
 * 2. les clés que la ressource émet → le `return [...]` de `PropertyResource::toArray()` (PHP) ;
 * 3. les colonnes demandées → les constantes importées ci-dessus, les vraies ;
 * 4. les clés réellement LUES → le code source des composants consommateurs.
 *
 * Un composant qui se met à lire `property.bedrooms` sans que `bedrooms` soit demandé fait
 * rougir (1). Un composant qui se met à lire un attribut **calculé** non déclaré au contrat
 * fait rougir (2) : ce cas-là ne se corrige pas en étendant la liste — cf. ci-dessous — il
 * exige que `PropertyResource` serve la clé INCONDITIONNELLEMENT, et le contrat doit le dire.
 *
 * ## Pourquoi `main_photo_url` n'est PAS dans les listes — mesuré le 2026-08-21
 *
 * `main_photo_url`, `location`, `*_label` sont des attributs calculés, pas des colonnes.
 * Spatie ne valide `fields[]` que contre `$queryFields`, et refuse tout le reste :
 *
 *     GET /api/properties?fields[properties]=id,title,main_photo_url   → HTTP 400
 *       « Requested field(s) `properties.main_photo_url` are not allowed. »
 *     GET /api/properties?fields[properties]=id,status_label           → HTTP 400
 *     GET /api/properties?fields[properties]=id,title                  → HTTP 200
 *
 * Le contrat de TCK-336 est donc à DEUX ensembles disjoints : ce qui se demande (colonnes)
 * et ce qui se sert quoi qu'il arrive (calculé/relations). `SERVIES_INCONDITIONNELLEMENT`
 * ci-dessous est la seconde moitié, écrite noir sur blanc parce qu'aucun type ne la porte.
 *
 * ⚠ `web-ci.yml` doit déclencher sur les deux fichiers PHP lus ici — même règle que
 * `search-filters.parity.test.ts` (TCK-335) : les deux côtés qu'une garde compare doivent
 * la déclencher, sinon elle dort quand le back bouge seul.
 */
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const MODELE = join(RACINE, 'takussan-api', 'app', 'Models', 'Property.php');
const RESSOURCE = join(RACINE, 'takussan-api', 'app', 'Http', 'Resources', 'PropertyResource.php');

/** Colonnes que spatie accepte dans `fields[properties]` — tout le reste rend 400. */
function colonnesDemandables(): Set<string> {
  const php = readFileSync(MODELE, 'utf8');
  const bloc = /protected static array \$queryFields = \[([\s\S]*?)\n\s*\];/.exec(php);
  expect(bloc, `$queryFields introuvable dans ${MODELE}`).not.toBeNull();
  const cles = [...bloc![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  expect(cles.length, 'aucune colonne extraite de $queryFields').toBeGreaterThan(20);
  return new Set(cles);
}

/** Clés de premier niveau réellement émises par `PropertyResource::toArray()`. */
function clesDeLaRessource(): Set<string> {
  const php = readFileSync(RESSOURCE, 'utf8');
  const bloc = /public function toArray\(Request \$request\): array[\s\S]*?return \[([\s\S]*?)\n {8}\];/.exec(php);
  expect(bloc, `toArray() introuvable dans ${RESSOURCE}`).not.toBeNull();
  // Indentation 12 = premier niveau du tableau retourné ; les tableaux imbriqués
  // (photos, tags, collaborators…) sont à 16 ou 20 et ne doivent pas être comptés.
  const cles = [...bloc![1].matchAll(/^ {12}'([a-z_]+)' =>/gm)].map((m) => m[1]);
  expect(cles.length, 'aucune clé extraite de PropertyResource::toArray()').toBeGreaterThan(30);
  return new Set(cles);
}

/**
 * Clés lues sur `receveur` dans un fichier source.
 *
 * Le `lookbehind` sur `['"\w.]` écarte les faux positifs qui ont coûté une passe :
 * `useTranslations('property.dashboard.tabs')` n'est pas une lecture de `property.dashboard`.
 * `?.` est normalisé en `.` — `conversation?.property?.main_photo_url` est bien une lecture.
 */
function clesLues(chemin: string, receveurs: readonly string[]): Set<string> {
  const src = readFileSync(join(RACINE, 'takussan-web', chemin), 'utf8').replace(/\?\./g, '.');
  const lues = new Set<string>();
  for (const receveur of receveurs) {
    const motif = new RegExp(`(?<!['"\\w.])${receveur}\\s*\\.\\s*([a-zA-Z_][a-zA-Z0-9_]*)`, 'g');
    for (const m of src.matchAll(motif)) lues.add(m[1]);
  }
  // Une garde qui ne trouve pas sa source doit le DIRE, pas passer au vert sur un
  // ensemble vide — c'est la forme de vacuité qui ressemble le plus à un succès.
  expect(lues.size, `aucune clé extraite de ${chemin} sur ${receveurs.join('/')}`).toBeGreaterThan(0);
  return lues;
}

interface Appelant {
  readonly nom: string;
  /** La liste réellement envoyée, importée du module de production. */
  readonly demande: readonly string[];
  /** Fichiers qui consomment la réponse, et le nom de la variable qui la porte. */
  readonly consommateurs: readonly (readonly [string, readonly string[]])[];
  /**
   * Clés que le consommateur lit et qui ne sont PAS des colonnes demandables :
   * `PropertyResource` doit les servir quel que soit `fields[]` (TCK-336).
   */
  readonly inconditionnelles: readonly string[];
  /**
   * Clés demandées absentes de `$queryFields`. Toléré UNIQUEMENT sur une route `show`,
   * qui n'instancie pas `QueryBuilder` et ne valide donc pas `fields[]` — mesuré le
   * 2026-08-21 : `GET /api/properties/131?fields[properties]=…,description` → 200, quand
   * la même clé sur `GET /api/properties` (index) → 400.
   */
  readonly horsQueryFields: readonly string[];
  /**
   * Plancher de vacuité : nombre de COLONNES que l'extraction doit reconnaître. Une garde
   * dont l'extraction rend le vide passerait au vert sans rien avoir vérifié — c'est la
   * forme d'échec qui ressemble le plus à un succès. Le chiffre est le compte MESURÉ le
   * 2026-08-21, pas une marge de confort : le baisser doit se remarquer.
   */
  readonly minColonnesLues: number;
}

const APPELANTS: readonly Appelant[] = [
  {
    nom: 'fetchDashboardProperties → DASHBOARD_PROPERTY_FIELDS',
    demande: DASHBOARD_PROPERTY_FIELDS,
    consommateurs: [
      ['src/app/(dashboard)/app/properties/page.tsx', ['property']],
      ['src/components/property-dashboard/PropertyList.tsx', ['property']],
      ['src/components/property-dashboard/PropertyRowActions.tsx', ['property']],
    ],
    inconditionnelles: ['location', 'main_photo_url', 'owner', 'collaborators'],
    horsQueryFields: [],
    minColonnesLues: 13,
  },
  {
    nom: 'fetchDashboardProperty → DASHBOARD_PROPERTY_DETAIL_FIELDS',
    demande: DASHBOARD_PROPERTY_DETAIL_FIELDS,
    consommateurs: [
      ['src/app/(dashboard)/app/properties/[id]/page.tsx', ['property']],
      ['src/components/property-dashboard/PropertyDetailTabs.tsx', ['property']],
      ['src/components/property-dashboard/PropertyOverviewPanel.tsx', ['property']],
      ['src/components/property-dashboard/PropertyHeaderActions.tsx', ['property']],
      ['src/components/property-form/PropertyForm.tsx', ['property']],
      ['src/components/property-form/PropertyModerationBanner.tsx', ['property']],
    ],
    inconditionnelles: [
      'location',
      'main_photo_url',
      'status_label',
      'type_label',
      'contract_type_label',
      'average_rating',
      'reviews_count',
      'photos',
      'price_history',
      'tags',
      'approved_at',
      'rejection_reason',
    ],
    horsQueryFields: ['description'],
    minColonnesLues: 20,
  },
  {
    nom: 'fetchAdminProperties / fetchAdminAgencyProperties → ADMIN_PROPERTY_FIELDS',
    demande: ADMIN_PROPERTY_FIELDS,
    consommateurs: [
      ['src/components/admin/super/SuperAdminPropertiesTable.tsx', ['row']],
      ['src/components/admin/super/agency-detail.tsx', ['property']],
    ],
    // Pas de `main_photo_url` : mesuré le 2026-08-21, ce tableau n'a AUCUNE vignette
    // (ni `<img>`, ni `next/image`, ni `main_photo_url` dans le fichier). TCK-336 prétend
    // le contraire ; ne pas lui en ajouter une au prétexte de « rétablir » l'existant.
    inconditionnelles: ['location', 'status_label', 'agency'],
    horsQueryFields: [],
    minColonnesLues: 13,
  },
  {
    nom: 'useConversations / useConversation → CONVERSATION_PROPERTY_FIELDS',
    demande: CONVERSATION_PROPERTY_FIELDS,
    consommateurs: [
      ['src/components/messages/ConversationList.tsx', ['conversation.property']],
      ['src/components/messages/ChatView.tsx', ['conversation.property']],
    ],
    inconditionnelles: ['main_photo_url'],
    horsQueryFields: [],
    minColonnesLues: 2,
  },
];

describe('fields[properties] — couverture des clés réellement lues (TCK-336)', () => {
  const DEMANDABLES = colonnesDemandables();
  const EMISES = clesDeLaRessource();

  it.each(APPELANTS.map((a) => [a.nom, a] as const))(
    '%s — toute COLONNE lue est demandée',
    (_nom, appelant) => {
      const demande = new Set<string>(appelant.demande);
      const lues = new Set<string>();
      for (const [fichier, receveurs] of appelant.consommateurs) {
        for (const cle of clesLues(fichier, receveurs)) lues.add(cle);
      }
      const colonnesLues = [...lues].filter((c) => DEMANDABLES.has(c)).sort();
      expect(
        colonnesLues.length,
        `extraction suspecte : ${colonnesLues.length} colonne(s) reconnue(s) pour ${colonnesLues.length < appelant.minColonnesLues ? 'moins' : 'au moins'} ${appelant.minColonnesLues} attendue(s) — ${colonnesLues.join(', ')}`,
      ).toBeGreaterThanOrEqual(appelant.minColonnesLues);
      const manquantes = colonnesLues.filter((c) => !demande.has(c));
      expect(
        manquantes,
        `colonnes LUES mais non DEMANDÉES — sous TCK-336 elles seront absentes de la réponse : ${manquantes.join(', ')}`,
      ).toEqual([]);
    },
  );

  it.each(APPELANTS.map((a) => [a.nom, a] as const))(
    '%s — toute clé NON demandable lue est au contrat des clés inconditionnelles',
    (_nom, appelant) => {
      const contrat = new Set<string>(appelant.inconditionnelles);
      const lues = new Set<string>();
      for (const [fichier, receveurs] of appelant.consommateurs) {
        for (const cle of clesLues(fichier, receveurs)) lues.add(cle);
      }
      // Seules comptent les clés que la RESSOURCE émet : `property.map(...)`,
      // `property.length` et consorts sont du JavaScript, pas du contrat d'API.
      // `description` est demandée ET hors `$queryFields` : elle relève de
      // `horsQueryFields`, pas du contrat inconditionnel — un seul test par cas.
      const demandees = new Set<string>(appelant.demande);
      const calculees = [...lues]
        .filter((c) => !DEMANDABLES.has(c) && !demandees.has(c) && EMISES.has(c))
        .sort();
      const horsContrat = calculees.filter((c) => !contrat.has(c));
      expect(
        horsContrat,
        `clés calculées LUES mais absentes du contrat : ${horsContrat.join(', ')}. `
          + 'Elles ne peuvent pas être ajoutées à `fields[properties]` (spatie rend 400) : '
          + 'PropertyResource doit les servir inconditionnellement, et il faut le déclarer ici.',
      ).toEqual([]);
    },
  );

  it.each(APPELANTS.map((a) => [a.nom, a] as const))(
    '%s — le contrat inconditionnel ne cite que des clés que PropertyResource émet',
    (_nom, appelant) => {
      const fantomes = appelant.inconditionnelles.filter((c) => !EMISES.has(c));
      expect(
        fantomes,
        `clés déclarées inconditionnelles mais ABSENTES de PropertyResource::toArray() : ${fantomes.join(', ')}`,
      ).toEqual([]);
    },
  );

  it.each(APPELANTS.map((a) => [a.nom, a] as const))(
    '%s — toute clé demandée est acceptée par spatie (sinon HTTP 400)',
    (_nom, appelant) => {
      const tolerees = new Set<string>(appelant.horsQueryFields);
      const refusees = appelant.demande.filter(
        (c) => !DEMANDABLES.has(c) && !tolerees.has(c),
      );
      expect(
        refusees,
        `clés demandées absentes de Property::$queryFields — spatie rend 400 InvalidFieldQuery sur toute route index : ${refusees.join(', ')}`,
      ).toEqual([]);
    },
  );

  it('aucune liste ne demande deux fois la même colonne', () => {
    for (const appelant of APPELANTS) {
      expect(
        [...appelant.demande].sort(),
        `${appelant.nom} contient un doublon`,
      ).toEqual([...new Set(appelant.demande)].sort());
    }
  });
});
