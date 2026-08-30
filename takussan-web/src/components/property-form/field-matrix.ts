import type { PropertyFormValues } from '@/lib/schemas/property';

/**
 * TCK-464 — LA règle de pertinence des champs d'un bien, et le seul endroit où elle s'écrit.
 *
 * Trois consommateurs la lisent : le parcours de création, la page d'édition, et la sérialisation
 * du payload. Écrite trois fois en conditions inline, elle diverge en trois versions — et la
 * troisième est celle qui envoie au serveur un `rent_period` sur une vente.
 *
 * ⚠ Ce module ne rend rien et n'appelle aucun hook : il doit rester testable sans DOM.
 */
export type PropertyTypeValue = PropertyFormValues['type'];
export type ContractTypeValue = PropertyFormValues['contract_type'];

export type RelevanceContext = {
  readonly type: PropertyTypeValue;
  readonly contract: ContractTypeValue;
};

export type ConditionalFieldKey =
  | 'area'
  | 'bedrooms'
  | 'bathrooms'
  | 'furnished'
  | 'year_built'
  | 'parking_spaces'
  | 'floor_number'
  | 'total_floors'
  | 'title_type'
  | 'rent_period'
  | 'available_from'
  | 'tag_ids';

/** Un bien où l'on dort. Sert de base à plusieurs règles, jamais employée seule. */
const HABITABLE = ['house', 'apartment', 'villa', 'studio', 'room', 'hotel', 'resort'] as const;

/** Le bien EST le sol : rien n'y est bâti, donc rien de bâti ne se demande. */
const NU = ['land'] as const;

/** Le bien est un emplacement de véhicule : demander ses places de parking serait circulaire. */
const EMPLACEMENT = ['garage', 'parking'] as const;

/** Le bien occupe un niveau DANS un bâtiment qu'il ne possède pas en entier. */
const DANS_UN_BATIMENT = ['apartment', 'studio', 'room', 'office', 'shop'] as const;

function dans(liste: readonly string[], type: PropertyTypeValue): boolean {
  return liste.includes(type);
}

export function isFieldRelevant(cle: ConditionalFieldKey, ctx: RelevanceContext): boolean {
  const { type, contract } = ctx;

  switch (cle) {
    // La surface se demande toujours ; seul son LIBELLÉ change (cf. areaLabelKey).
    case 'area':
      return true;

    // Un studio est une pièce unique, une chambre en est une : le compte est impliqué par le
    // type, et le demander invite à saisir une valeur qui contredira le type.
    case 'bedrooms':
      return dans(HABITABLE, type) && type !== 'studio' && type !== 'room';

    case 'bathrooms':
      return !dans(NU, type) && !dans(EMPLACEMENT, type);

    case 'furnished':
      return dans(HABITABLE, type) || type === 'office' || type === 'shop';

    case 'year_built':
      return !dans(NU, type);

    case 'parking_spaces':
      return !dans(NU, type) && !dans(EMPLACEMENT, type);

    case 'floor_number':
      return dans(DANS_UN_BATIMENT, type);

    // Strictement complémentaire de `floor_number` sur les types bâtis : l'invariant du test
    // le vérifie sur les 16 types, pas sur un échantillon.
    case 'total_floors':
      return !dans(NU, type) && !dans(DANS_UN_BATIMENT, type);

    // Le statut foncier porte sur le SOL, pas sur le lot : une exclusion, pas une liste.
    // Il est sans objet dans deux cas seulement — un lot DANS un bâtiment qu'on ne possède pas en
    // entier (le foncier est celui de l'immeuble) et un EMPLACEMENT — tout le reste en a un.
    case 'title_type':
      return !dans(DANS_UN_BATIMENT, type) && !dans(EMPLACEMENT, type);

    case 'rent_period':
    case 'available_from':
      return contract === 'rent';

    // Les tags `amenity` seedés sont domestiques (WiFi, TV, machine à laver…) : les proposer sur
    // un terrain ou un parking n'offre aucun choix pertinent.
    case 'tag_ids':
      return !dans(NU, type) && !dans(EMPLACEMENT, type);
  }
}

/**
 * La clé i18n du libellé de surface. Un terrain et une ferme se mesurent en surface de PARCELLE,
 * un logement en surface HABITABLE — ce n'est pas la même grandeur, et les confondre fausse la
 * comparaison entre deux annonces.
 */
export function areaLabelKey(type: PropertyTypeValue): 'fields.areaLand' | 'fields.areaLiving' {
  return type === 'land' || type === 'farm' ? 'fields.areaLand' : 'fields.areaLiving';
}

/**
 * TCK-469 — ce que devient une clé conditionnelle que le contexte ne justifie plus.
 *
 * - `'omit'` — la clé disparaît du payload. C'est le chemin de CRÉATION : on n'envoie pas ce
 *   qu'on n'a pas, et il n'existe aucune valeur antérieure en base à contredire.
 * - `'erase'` — la clé part avec sa valeur d'effacement. C'est le chemin d'ÉDITION.
 */
export type SanitizeMode = 'omit' | 'erase';

/**
 * TCK-469 — LA décision : à l'édition, on EFFACE plutôt qu'on ne conserve.
 *
 * Les deux réponses se défendaient. Celle-ci l'emporte pour une raison qui n'est pas d'esthétique
 * de la donnée : une valeur conservée n'a, depuis cet écran, plus AUCUNE affordance pour être
 * corrigée — le champ n'y est plus rendu. Un `bedrooms: 3` sur un terrain devient alors invisible
 * ET faux, et il ressort ailleurs : filtres de recherche, exports, comparateur, cartes de liste —
 * aucun de ces lecteurs ne consulte la matrice de pertinence avant d'afficher un nombre de
 * chambres. Le coût du choix inverse est borné et visible : qui fait un aller-retour de type
 * ressaisit sa valeur, une fois, sur un écran où le champ est de nouveau rendu.
 *
 * ⚠ La valeur d'effacement n'est pas `null` partout, et ce n'est pas un détail de style :
 * `UpdatePropertyRequest` déclare `nullable` sur les dix clés qui suivent, mais `furnished` y est
 * `['sometimes', 'boolean']` et sa colonne est `boolean NOT NULL DEFAULT false`. Un `null` sur
 * `furnished` produirait un 422, pas un effacement. Sa valeur d'effacement est donc `false` —
 * l'état vrai d'un bien qui ne peut pas être meublé.
 *
 * ⚠ `tag_ids` est absent de cette table DÉLIBÉRÉMENT : il ne voyage jamais dans le corps du bien
 * (`payload.ts` l'en retire, `UpdatePropertyRequest` ne le déclare pas) et passe par son propre
 * endpoint. Il reste donc omis dans les deux modes.
 */
const VALEUR_D_EFFACEMENT = {
  area: null,
  bedrooms: null,
  bathrooms: null,
  furnished: false,
  year_built: null,
  parking_spaces: null,
  floor_number: null,
  total_floors: null,
  title_type: null,
  rent_period: null,
  available_from: null,
} as const satisfies Partial<Record<ConditionalFieldKey, null | false>>;

/**
 * Retire de `values` toute clé conditionnelle que le contexte déclare non pertinente — ou, en
 * mode `'erase'`, lui substitue sa valeur d'effacement (cf. `VALEUR_D_EFFACEMENT`).
 *
 * ⚠ Une clé absente de l'entrée reste absente de la sortie, DANS LES DEUX MODES : la fonction
 * n'ajoute jamais `undefined` ni `null`, sans quoi un `PATCH` partiel effacerait en base des
 * champs que personne n'a touchés.
 */
export function sanitizeByType<T extends Record<string, unknown>>(
  values: T,
  ctx: RelevanceContext,
  mode: SanitizeMode = 'omit',
): T {
  const sortie: Record<string, unknown> = { ...values };
  for (const cle of Object.keys(sortie)) {
    if (!estConditionnelle(cle)) continue;
    if (isFieldRelevant(cle, ctx)) continue;
    if (mode === 'erase' && cle in VALEUR_D_EFFACEMENT) {
      sortie[cle] = VALEUR_D_EFFACEMENT[cle as keyof typeof VALEUR_D_EFFACEMENT];
      continue;
    }
    delete sortie[cle];
  }
  return sortie as T;
}

const CLES_CONDITIONNELLES = new Set<string>([
  'area', 'bedrooms', 'bathrooms', 'furnished', 'year_built', 'parking_spaces',
  'floor_number', 'total_floors', 'title_type', 'rent_period', 'available_from', 'tag_ids',
]);

function estConditionnelle(cle: string): cle is ConditionalFieldKey {
  return CLES_CONDITIONNELLES.has(cle);
}
