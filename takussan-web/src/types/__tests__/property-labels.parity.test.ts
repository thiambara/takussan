import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Garde de PARITÉ sur les libellés de bien émis PAR L'API et affichés PAR LE FRONT.
 *
 * ## Pourquoi cette garde existe
 *
 * Le principe non négociable n°5 du `CLAUDE.md` racine dit que **le front possède le texte
 * affiché** : « l'API émet des codes et des données ; les libellés passent par next-intl ».
 * `PropertyResource` le viole — mesuré le 2026-08-22, il émet **cinq** champs de libellé
 * (`type_label`, `contract_type_label`, `rent_period_label`, `status_label`,
 * `title_type_label`, lignes 61-70), traduits côté serveur par
 * `BaseResource::enumLabel()` depuis `takussan-api/lang/<locale>/properties.php`.
 *
 * Et le front les CONSOMME : `app/(public)/properties/[slug]/page.tsx:74` rend
 * `property.type_label`, `PropertyCharacteristics.tsx:19-20` rendent
 * `contract_type_label` et `rent_period_label` — pendant que les cartes et les filtres
 * de recherche rendent, eux, `property.types` du dictionnaire.
 *
 * **Deux sources de vérité s'affichent donc dans le même parcours**, et rien ne les
 * comparait. Mesuré à l'ouverture de cette garde : **44 divergences de valeur**, dont une
 * qui n'est pas une nuance de style — `status.pending` vaut « Réservé » côté API et
 * « En attente » côté front, deux choses différentes pour le même état.
 *
 * TCK-292 avait nommé ce risque et l'avait mis hors périmètre, faute de mesure :
 * *« Si l'API renvoie des phrases françaises, traduire le front ne suffira pas : ce sera un
 * ticket backend, pas celui-ci. »* La mesure est faite ; le ticket est **TCK-351**.
 *
 * ## Ce que cette garde fait, et ce qu'elle ne fait pas
 *
 * Elle est un **cliquet à contenu nommé**, pas une liste de tolérance : chaque divergence
 * connue est écrite ci-dessous, et la garde rougit dans les DEUX sens —
 *
 *   · une divergence NOUVELLE, non inscrite → rouge. C'est ce qui empêche la dette de croître ;
 *   · une entrée inscrite qui a CESSÉ de diverger → rouge aussi. Sans cela, la liste pourrit
 *     et finit par excuser des divergences qui n'existent plus, en masquant celles qui les
 *     ont remplacées. Même règle que `EXCEPTIONS_JUSTIFIEES` de
 *     `scripts/check-resource-date-format.mjs` et que `scripts/i18n-exceptions.mjs`.
 *
 * Elle ne dit PAS laquelle des deux valeurs est juste. Sur les 24 divergences wolof, seul un
 * locuteur peut trancher (`farm` : l'API dit « Jën », qui désigne le poisson, quand le front
 * dit « Tool », qui désigne le champ) — c'est l'objet de TCK-342 et de TCK-351.
 *
 * ⚠ `web-ci.yml` doit déclencher sur les DEUX côtés lus ici : les fichiers
 * `lang/<locale>/properties.php` (écrit ainsi et non avec une étoile : la séquence qui suit
 * une étoile refermerait ce commentaire — elle l'a déjà fait une fois en écrivant ce fichier)
 * ET les dictionnaires. Les deux côtés qu'une garde compare doivent la déclencher, sinon elle
 * dort quand l'un bouge seul.
 */
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const LOCALES = ['fr', 'en', 'wo'] as const;

/** Groupe PHP → sous-arbre `property.*` du dictionnaire. */
const GROUPES: Record<string, string> = {
  type: 'types',
  contract_type: 'contractTypes',
  rent_period: 'rentPeriods',
  status: 'status',
  // TCK-464 — `title_type` A un pendant front depuis que le formulaire l'expose. Le
  // vocabulaire a été aligné au caractère près sur `lang/<locale>/properties.php` DANS le
  // même lot : aucune entrée n'entre dans DIVERGENCES_CONNUES, la garde se resserre sans
  // acquérir de tolérance.
  title_type: 'titleTypes',
};

/**
 * Les divergences CONNUES, au 2026-08-22, sous la forme `<groupe>.<locale>.<clé>`.
 *
 * Elles ne sont pas excusées : elles sont COMPTÉES, en attendant l'arbitrage de **TCK-351**,
 * qui doit décider laquelle des deux sources porte le texte affiché. Chacune est une
 * divergence RÉELLE et vérifiée par cette garde à chaque exécution.
 *
 * ⚠ Cette liste ne doit que RÉTRÉCIR. Une entrée qu'on ajoute est une régression du principe
 * n°5, pas une dette qu'on assume.
 */
const DIVERGENCES_CONNUES = new Set<string>([
  'type.en.resort',
  'type.en.shop',
  'type.wo.apartment',
  'type.wo.factory',
  'type.wo.farm',
  'type.wo.garage',
  'type.wo.hotel',
  'type.wo.land',
  'type.wo.office',
  'type.wo.other',
  'type.wo.resort',
  'type.wo.room',
  'type.wo.shop',
  'type.wo.villa',
  'type.wo.warehouse',
  'contract_type.fr.rent',
  'contract_type.fr.sale',
  'contract_type.en.rent',
  'contract_type.en.sale',
  'contract_type.wo.rent',
  'contract_type.wo.sale',
  'rent_period.fr.daily',
  'rent_period.fr.monthly',
  'rent_period.fr.weekly',
  'rent_period.fr.yearly',
  'rent_period.en.daily',
  'rent_period.en.monthly',
  'rent_period.en.weekly',
  'rent_period.en.yearly',
  'rent_period.wo.daily',
  'rent_period.wo.monthly',
  'rent_period.wo.weekly',
  'rent_period.wo.yearly',
  'status.fr.pending',
  'status.en.under_maintenance',
  'status.wo.archived',
  'status.wo.available',
  'status.wo.draft',
  'status.wo.pending',
  'status.wo.published',
  'status.wo.rented',
  'status.wo.sold',
  'status.wo.unavailable',
  'status.wo.under_maintenance',
]);

function tablePhp(locale: string, groupe: string): Record<string, string> {
  const chemin = join(RACINE, 'takussan-api', 'lang', locale, 'properties.php');
  const source = readFileSync(chemin, 'utf8');
  const bloc = new RegExp(`'${groupe}'\\s*=>\\s*\\[(.*?)\\n    \\]`, 's').exec(source);
  expect(bloc, `groupe '${groupe}' introuvable dans ${chemin}`).not.toBeNull();
  const table: Record<string, string> = {};
  for (const [, cle, valeur] of bloc![1].matchAll(/'([a-z_]+)'\s*=>\s*'([^']*)'/g)) {
    table[cle] = valeur;
  }
  expect(Object.keys(table).length, `aucune entrée lue dans ${groupe} (${locale})`).toBeGreaterThan(1);
  return table;
}

function tableFront(locale: string, sousArbre: string): Record<string, string> {
  const chemin = join(RACINE, 'takussan-web', 'src', 'messages', `${locale}.json`);
  const dictionnaire = JSON.parse(readFileSync(chemin, 'utf8')) as Record<string, unknown>;
  const propriete = (dictionnaire.property ?? {}) as Record<string, unknown>;
  const table = (propriete[sousArbre] ?? {}) as Record<string, string>;
  expect(Object.keys(table).length, `property.${sousArbre} vide dans ${chemin}`).toBeGreaterThan(1);
  return table;
}

/** Toutes les divergences réellement présentes dans l'arbre, à l'instant du test. */
function divergencesMesurees(): string[] {
  const trouvees: string[] = [];
  for (const [groupe, sousArbre] of Object.entries(GROUPES)) {
    for (const locale of LOCALES) {
      const api = tablePhp(locale, groupe);
      const front = tableFront(locale, sousArbre);
      for (const cle of Object.keys(api).sort()) {
        if (front[cle] !== undefined && front[cle] !== api[cle]) {
          trouvees.push(`${groupe}.${locale}.${cle}`);
        }
      }
    }
  }
  return trouvees;
}

describe('TCK-351 — parité des libellés de bien entre l’API et le dictionnaire du front', () => {
  it('n’introduit aucune divergence nouvelle', () => {
    const nouvelles = divergencesMesurees().filter((d) => !DIVERGENCES_CONNUES.has(d));
    // Une divergence neuve, c'est deux textes différents pour le même état, affichés dans le
    // même parcours — le défaut que TCK-351 existe pour solder, en train de grossir.
    expect(nouvelles).toEqual([]);
  });

  it('ne garde aucune entrée qui aurait cessé de diverger', () => {
    const mesurees = new Set(divergencesMesurees());
    const perimees = [...DIVERGENCES_CONNUES].filter((d) => !mesurees.has(d));
    // Sans ce contrôle, la liste pourrit : elle finirait par excuser des divergences qui
    // n'existent plus, en masquant celles qui les ont remplacées.
    expect(perimees).toEqual([]);
  });

  it('mesure réellement quelque chose', () => {
    // La vacuité qui ressemble le plus à un succès : deux sources illisibles, zéro comparaison,
    // et les deux contrôles ci-dessus au vert sur des ensembles vides.
    let comparees = 0;
    for (const [groupe, sousArbre] of Object.entries(GROUPES)) {
      for (const locale of LOCALES) {
        const api = tablePhp(locale, groupe);
        const front = tableFront(locale, sousArbre);
        comparees += Object.keys(api).filter((c) => front[c] !== undefined).length;
      }
    }
    expect(comparees).toBeGreaterThan(80);
  });
});
