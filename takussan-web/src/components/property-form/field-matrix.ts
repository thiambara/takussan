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
 * Retire de `values` toute clé conditionnelle que le contexte déclare non pertinente.
 *
 * ⚠ Une clé absente de l'entrée reste absente de la sortie : la fonction n'ajoute jamais
 * `undefined`, sans quoi un `PATCH` partiel effacerait en base des champs que personne n'a
 * touchés.
 */
export function sanitizeByType<T extends Record<string, unknown>>(
  values: T,
  ctx: RelevanceContext,
): T {
  const sortie: Record<string, unknown> = { ...values };
  for (const cle of Object.keys(sortie)) {
    if (!estConditionnelle(cle)) continue;
    if (!isFieldRelevant(cle, ctx)) delete sortie[cle];
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
