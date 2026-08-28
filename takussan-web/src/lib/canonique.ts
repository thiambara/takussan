import {
  type CleDeRechercheNom,
  CLES_DE_RECHERCHE,
  definitionDe,
} from '@/types/search';
import { contractTypeValues, propertyTypeValues } from '@/lib/schemas/property';
import type { ContractType, PropertyType } from '@/types/property';

/**
 * La règle de CANONICITÉ de `/properties` — TCK-433.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI EST TRANCHÉ, ET POURQUOI CE N'EST PAS « L'URL COURANTE »
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `/properties` porte **23 clés** (`CLES_DE_RECHERCHE`, mesuré le 2026-08-27) : 20 filtres plus
 * `sort`, `page` et `per_page`. Toutes sont sérialisées dans l'URL par `useSearch`, par
 * construction (TCK-340). Un moteur voit donc une page distincte par combinaison, servant
 * essentiellement le même catalogue.
 *
 * Poser `canonical = URL courante` reviendrait à ne rien décider — c'est exactement ce que le
 * ticket refuse. Le partage retenu est le suivant.
 *
 * ── TROIS CLÉS GARDENT LEUR PROPRE URL INDEXABLE ────────────────────────────────────────────────
 *
 * `contract_type`, `type`, `city` — et le critère est le même pour les trois :
 *
 * · **leur ensemble de valeurs est FINI et énumérable** — 2 pour le contrat, 16 pour le type, les
 *   villes du catalogue pour la troisième. Le nombre de pages indexables reste donc borné, ce qui
 *   est la seule propriété qui compte ici : une clé à valeurs libres produit une page par valeur
 *   saisie ;
 *
 *   ⚠️ **Ce critère était ÉCRIT et appliqué NULLE PART jusqu'au 2026-08-28.** Mesuré sur un build
 *   de production : `?city=Zzzinventee` rendait une URL `index, follow`, canonique d'elle-même,
 *   avec un `<title>` dérivé de la valeur fournie ; `?type=zzz` y ajoutait une **clé d'i18n brute
 *   dans le `<title>`** (`property.types.zzz`). L'espace d'URL indexables n'était donc borné par
 *   rien — le défaut que ce module existe pour fermer, ramené d'un cran.
 *
 *   *Un ensemble énumérable dont personne ne vérifie l'appartenance n'est pas un ensemble fini,
 *   c'est une intention.* {@link filtresCanoniques} vérifie désormais l'appartenance, et une
 *   valeur hors domaine se replie sur la page nue — le même geste que le `other {}` du gabarit
 *   ICU du titre ;
 * · **elles nomment une INTENTION de recherche** — « villas à louer à Dakar » est une requête
 *   qu'un visiteur formule ; « biens entre 45 000 et 47 500 F, triés par surface » ne l'est pas ;
 * · **elles ont déjà un libellé traduit** (`property.types`, `property.contractTypes`), donc le
 *   `<title>` dérivé se dit dans les trois langues sans dictionnaire neuf.
 *
 * ── LES DIX-SEPT AUTRES FILTRES SE REPLIENT SUR LA PAGE NUE ─────────────────────────────────────
 *
 * Texte libre (`q`), rayon géographique (`radius_km`/`lat`/`lng`, à valeurs continues), bornes
 * numériques (`price_min`/`price_max`, `area_min`/`area_max`, `bedrooms`, `bathrooms`,
 * `floor_number`), `furnished`, `featured`, `available_from`, `tags`, `rent_period`, `location`.
 * Chacune multiplie les URL sans changer ce que la page EST : un sous-ensemble du même catalogue.
 *
 * ── LA PAGINATION ET LE TRI SE REPLIENT AUSSI, ET C'EST LE POINT LE PLUS DISCUTABLE ─────────────
 *
 * `page`, `sort`, `per_page` sont écartés : `?page=3` est canonique vers la page 1 du même jeu de
 * filtres. C'est contraire au réflexe habituel (une page de pagination est canonique d'elle-même),
 * et la raison est mesurée, pas doctrinale :
 *
 * · **la liste est rendue côté CLIENT** — `PropertiesDiscoveryPage` lit `useSearchParams` — donc
 *   un explorateur reçoit la MÊME coque HTML sur `?page=1` et sur `?page=42`. Les déclarer
 *   distinctes serait affirmer une différence que le document servi ne porte pas
 *   ([TCK-432](../../../docs/backlog/tickets/TCK-432-accueil-et-liste-sans-rendu-serveur.md)) ;
 * · **aucune fiche n'en dépend pour être découverte** : depuis TCK-431, `/sitemap.xml` liste
 *   chaque fiche publiée, dans les trois langues. L'argument habituel contre le repli — « les
 *   biens des pages profondes deviennent introuvables » — ne tient pas ici.
 *
 * ⚠ **Le jour où TCK-432 rendra la liste côté serveur, cette décision doit être reprise** : la
 * première de ses deux raisons tombera.
 *
 * ── COHÉRENCE AVEC LE SITEMAP (AC5) ─────────────────────────────────────────────────────────────
 *
 * `src/app/sitemap.ts` ne déclare que `/properties` NUE. Aucune URL non canonique n'y entre donc,
 * et les URL de facettes (`?type=villa`) n'y entrent pas non plus : les pages de facettes dédiées
 * sont explicitement hors périmètre du ticket (« surface produit non spécifiée »). Elles restent
 * atteignables par le maillage interne, et se déclarent canoniques d'elles-mêmes quand on y arrive.
 */

/**
 * Les DOMAINES des trois facettes, injectés plutôt que lus — c'est ce qui garde
 * {@link filtresCanoniques} PURE et éprouvable.
 *
 * `villes` vaut `null` quand le domaine est inconnaissable (API injoignable, domaine tronqué).
 * `null` et « ensemble vide » ne sont pas la même chose et ne doivent pas se ressembler : le
 * premier veut dire « on ne sait pas », le second « le catalogue n'a aucune ville ». Les deux
 * font replier, mais seul le premier se journalise.
 */
export type DomainesDeFacette = {
  readonly types: ReadonlySet<string>;
  readonly contrats: ReadonlySet<string>;
  readonly villes: ReadonlyMap<string, string> | null;
};

/**
 * ⚠️ **Preuve de type que `propertyTypeValues` ÉNUMÈRE exactement `PropertyType`.**
 *
 * Sans elle, la liste runtime pourrait diverger du type sans qu'aucun test ne bouge : un type de
 * bien ajouté à l'union et oublié dans la liste cesserait silencieusement d'être une facette
 * indexable. `tsc` casse dans les DEUX sens — liste incomplète, ou liste inventant une valeur que
 * le type ne connaît pas.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * ⚠️⚠️ LA PREMIÈRE VERSION DE CETTE PREUVE NE POUVAIT PAS ÉCHOUER
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Elle s'écrivait :
 *
 *     const _preuve: [_ListeCouvreLeType, _TypeCouvreLaListe, _ContratsCouvrent][] = [];
 *
 * **Un littéral de tableau VIDE est assignable à n'importe quel type de tableau.** Que les
 * `Exclude<>` rendent `never` ou un littéral de chaîne n'y change rien : l'annotation est
 * satisfaite dans tous les cas. Mesuré le 2026-08-28, sur les deux sens que son propre docblock
 * annonçait :
 *
 * ```
 * 'chalet' AJOUTÉ à propertyTypeValues, absent de l'union   → npx tsc --noEmit  exit 0
 * 'garage' RETIRÉ de propertyTypeValues, resté dans l'union → npx tsc --noEmit  exit 0
 * ```
 *
 * Le second est exactement le cas que le docblock promettait d'attraper. *Une garde qui ne peut
 * pas échouer est pire qu'une garde absente : elle occupe la place et se relit comme une preuve.*
 *
 * La forme ci-dessous ÉCHOUE : {@link Verifie} contraint son paramètre à `never`, donc un
 * `Exclude<>` non vide viole la contrainte et `tsc` sort en 1 sur CE fichier. Les deux ablations
 * ci-dessus la font rougir toutes les deux — vérifié avant de l'écrire ici.
 */
type Verifie<T extends never> = T;
type _ListeCouvreLeType = Exclude<PropertyType, (typeof propertyTypeValues)[number]>;
type _TypeCouvreLaListe = Exclude<(typeof propertyTypeValues)[number], PropertyType>;
type _ContratsCouvrent = Exclude<ContractType, (typeof contractTypeValues)[number]>;
export type _PreuveListeCouvreLeType = Verifie<_ListeCouvreLeType>;
export type _PreuveTypeCouvreLaListe = Verifie<_TypeCouvreLaListe>;
export type _PreuveContratsCouvrent = Verifie<_ContratsCouvrent>;

/**
 * Les deux domaines que le dépôt connaît sans rien demander à personne.
 *
 * Ils viennent de `src/lib/schemas/property.ts`, où ils servent déjà aux formulaires — pas d'une
 * seconde énumération écrite ici, qui divergerait.
 */
export function domainesStatiques(): Pick<DomainesDeFacette, 'types' | 'contrats'> {
  return {
    types: new Set<string>(propertyTypeValues),
    contrats: new Set<string>(contractTypeValues),
  };
}

/**
 * Les clés qui MÉRITENT leur propre URL canonique, dans l'ordre où elles sont écrites.
 *
 * L'ordre est fixe et fait partie de la règle : sans lui, `?type=villa&city=Dakar` et
 * `?city=Dakar&type=villa` produiraient deux canoniques différentes pour la même page, ce qui est
 * précisément le défaut qu'on corrige.
 */
export const CLES_CANONIQUES: readonly CleDeRechercheNom[] = ['contract_type', 'type', 'city'];

/** Le chemin de la liste, sans langue et sans paramètre. */
export const CHEMIN_LISTE = '/properties';

/**
 * Les valeurs retenues pour la canonique, lues par les MÊMES fonctions que `useSearch`.
 *
 * ⚠ Réutiliser `definitionDe(cle).lire` n'est pas une économie de lignes : c'est ce qui fait que
 * `?search=villa` et `?q=villa` se comportent identiquement (la clé `q` possède les deux
 * paramètres depuis TCK-335), et qu'une clé ajoutée à la table est lue ici sans qu'on y pense.
 * Une seconde lecture écrite à la main divergerait, et la divergence produirait deux canoniques
 * pour une même page.
 */
export function filtresCanoniques(
  params: URLSearchParams,
  domaines: DomainesDeFacette,
): Map<CleDeRechercheNom, string> {
  const retenus = new Map<CleDeRechercheNom, string>();

  for (const cle of CLES_CANONIQUES) {
    const definition = definitionDe(cle);
    const valeur = definition.lire(params);
    if (valeur === undefined || valeur === null) continue;

    // `type` est MULTI-VALUÉ (`type=villa,house`). Une sélection multiple est une vue composée par
    // l'utilisateur, pas une facette : elle se replie sur la page nue. Une seule valeur est une
    // facette et garde son URL.
    if (Array.isArray(valeur)) {
      if (valeur.length !== 1) continue;
    }

    const ecrit = definition.ecrire(valeur);
    if (ecrit === undefined || ecrit === '') continue;

    // ⚠️ **L'APPARTENANCE AU DOMAINE, et c'est le contrôle qui manquait.** Une valeur hors domaine
    // ne fait pas échouer : elle se replie, exactement comme le `other {}` du gabarit ICU du
    // titre. Un 404 ou une erreur seraient faux — l'URL reste servie, elle cesse seulement d'être
    // une facette indexable.
    const canonique = valeurCanoniqueDe(cle, ecrit, domaines);
    if (canonique === null) continue;

    retenus.set(cle, canonique);
  }

  return retenus;
}

/**
 * La valeur canonique d'une facette, ou `null` si elle n'appartient pas au domaine.
 *
 * ⚠ Elle NORMALISE en plus de vérifier : `?city=dakar` et `?city=Dakar` désignent la même page et
 * doivent produire la MÊME canonique. Sans ce repli, la validation aurait fermé un espace non
 * borné pour en rouvrir un plus petit — une URL indexable par variante de casse.
 */
function valeurCanoniqueDe(
  cle: CleDeRechercheNom,
  valeur: string,
  domaines: DomainesDeFacette,
): string | null {
  if (cle === 'city') {
    // `null` = domaine inconnaissable. On replie, parce qu'affirmer une canonique sur un domaine
    // qu'on ne connaît pas serait exactement la faute qu'on corrige.
    if (domaines.villes === null) return null;
    return domaines.villes.get(valeur.trim().toLocaleLowerCase('fr')) ?? null;
  }

  const replie = valeur.trim().toLowerCase();
  if (cle === 'type') return domaines.types.has(replie) ? replie : null;
  if (cle === 'contract_type') return domaines.contrats.has(replie) ? replie : null;

  // Inatteignable tant que `CLES_CANONIQUES` porte ces trois clés — et le test de partition le
  // vérifie. Refuser plutôt que laisser passer : une quatrième clé retenue sans domaine écrit
  // rouvrirait l'espace non borné en silence.
  return null;
}

/**
 * Le CHEMIN canonique de `/properties` pour une requête donnée — sans langue et sans origine.
 *
 * `/properties?type=villa&page=3&sort=-created_at&per_page=48` → `/properties?type=villa`.
 */
export function cheminCanoniqueDeLaListe(
  params: URLSearchParams,
  domaines: DomainesDeFacette,
): string {
  const retenus = filtresCanoniques(params, domaines);
  if (retenus.size === 0) return CHEMIN_LISTE;

  const query = new URLSearchParams();
  // On réécrit dans l'ordre de `CLES_CANONIQUES`, pas dans celui de la requête.
  for (const cle of CLES_CANONIQUES) {
    const valeur = retenus.get(cle);
    if (valeur !== undefined) query.set(definitionDe(cle).params[0], valeur);
  }

  return `${CHEMIN_LISTE}?${query.toString()}`;
}

/** `searchParams` de Next → `URLSearchParams`, une valeur répétée gardant la PREMIÈRE. */
export function versParametres(
  brut: Readonly<Record<string, string | readonly string[] | undefined>>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(brut)) {
    if (valeur === undefined) continue;
    // Next rend un tableau quand le paramètre est répété (`?type=a&type=b`). `litTexte` attend une
    // chaîne : on garde la première, comme le ferait `URLSearchParams.get`.
    params.set(cle, Array.isArray(valeur) ? (valeur[0] ?? '') : String(valeur));
  }
  return params;
}

/**
 * Les clés que la canonique ÉCARTE — dérivé, jamais recopié.
 *
 * Exporté pour le test de la règle : il vérifie que la partition couvre les 23 clés de la table,
 * de sorte qu'une clé ajoutée à `SEARCH_FILTER_KEYS` sans décision de canonicité fasse rougir.
 */
export const CLES_ECARTEES: readonly CleDeRechercheNom[] = CLES_DE_RECHERCHE.filter(
  (cle) => !CLES_CANONIQUES.includes(cle),
);
