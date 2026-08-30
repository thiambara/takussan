import type { PropertyFormPayload } from '@/lib/schemas/property';

import {
  sanitizeByType,
  type ConditionalFieldKey,
  type RelevanceContext,
  type SanitizeMode,
} from './field-matrix';

/**
 * TCK-464 — la traduction « valeurs du formulaire → corps de requête », et le seul endroit où
 * l'adresse est composée.
 *
 * ⚠ L'adresse part IMBRIQUÉE (`address: {…}`). `StorePropertyRequest` la déclare ainsi et
 * `PropertyController::store()` la crée dans la même transaction que le bien. La version
 * précédente envoyait `city`/`quarter`/`region` au PREMIER niveau — où aucune règle ne les
 * déclare, donc `validated()` les jetait — puis tentait un `PUT …/address` de rattrapage, sous
 * une condition qui ne testait pas la ville. Une création qui ne renseignait que la ville, le
 * chemin nominal, ne produisait donc aucune adresse du tout.
 *
 * ⚠ `quarter` (formulaire) → `neighborhood` (colonne). Le nom diverge des deux côtés depuis
 * l'origine ; c'est ici, et nulle part ailleurs, qu'il se traduit.
 */
export type PropertyAddressBlock = {
  street?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  postal_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

const CLES_ADRESSE = [
  'street', 'quarter', 'city', 'region', 'country', 'postal_code', 'latitude', 'longitude',
] as const;

type CleAdresseFormulaire = (typeof CLES_ADRESSE)[number];

/**
 * TCK-470 — les clés que le corps ne doit JAMAIS porter au premier niveau, écrites comme un
 * INTERDIT de typage et non comme un commentaire.
 *
 * ⚠ C'est la ligne qui aurait attrapé le défaut central de TCK-464 : `city` partait à plat, où
 * `StorePropertyRequest` ne la déclare pas, donc `validated()` la jetait — une création qui ne
 * renseignait que la ville n'écrivait aucune adresse. Un `as never` au point d'appel avait fait
 * taire le compilateur, et avec lui la seule chose qui pouvait le dire.
 *
 * `tag_ids` y figure pour la même raison : les tags ont leur propre endpoint
 * (`setPropertyTagsAction`), et `UpdatePropertyRequest` ne déclare pas la clé.
 */
type ClesInterditesAuPremierNiveau = {
  [K in CleAdresseFormulaire | 'tag_ids']?: never;
};

type ChampsDuFormulaireHorsAdresse = Omit<
  PropertyFormPayload,
  CleAdresseFormulaire | 'tag_ids'
>;

type CleConditionnelleDuCorps = Extract<
  keyof ChampsDuFormulaireHorsAdresse,
  ConditionalFieldKey
>;

/**
 * Les champs du bien tels qu'ils partent réellement.
 *
 * Les clés conditionnelles y sont OPTIONNELLES (`sanitizeByType` peut les retirer — chemin de
 * création) et NULLABLES (elle peut les effacer — chemin d'édition, TCK-469). Les autres restent
 * ce que le schéma en dit.
 */
export type PropertyBodyFields = Omit<
  ChampsDuFormulaireHorsAdresse,
  CleConditionnelleDuCorps
> & {
  [K in CleConditionnelleDuCorps]?: ChampsDuFormulaireHorsAdresse[K] | null;
};

export type PropertyCreatePayload = PropertyBodyFields &
  ClesInterditesAuPremierNiveau & {
    status: 'draft' | 'pending_review';
    visibility: 'private';
    address?: PropertyAddressBlock;
  };

export type PropertyUpdatePayload = PropertyBodyFields &
  ClesInterditesAuPremierNiveau & {
    address?: PropertyAddressBlock;
  };

function contexte(values: PropertyFormPayload): RelevanceContext {
  return { type: values.type, contract: values.contract_type };
}

/** Compose le bloc adresse. Rend `undefined` — et non un objet vide — si rien n'est renseigné. */
function blocAdresse(values: PropertyFormPayload): PropertyAddressBlock | undefined {
  const bloc: PropertyAddressBlock = {};
  const source = values as unknown as Record<string, unknown>;

  for (const cle of CLES_ADRESSE) {
    const valeur = source[cle];
    if (valeur === undefined || valeur === null || valeur === '') continue;
    if (cle === 'quarter') bloc.neighborhood = valeur as string;
    else (bloc as Record<string, unknown>)[cle] = valeur;
  }

  return Object.keys(bloc).length > 0 ? bloc : undefined;
}

/** Retire du corps les clés d'adresse et les tags — les deux ont leur propre chemin. */
function corpsDuBien(
  values: PropertyFormPayload,
  mode: SanitizeMode,
): PropertyBodyFields {
  const corps = sanitizeByType(
    { ...(values as unknown as Record<string, unknown>) },
    contexte(values),
    mode,
  );
  for (const cle of CLES_ADRESSE) delete corps[cle];
  delete corps.tag_ids;
  return corps as PropertyBodyFields;
}

/**
 * TCK-469 — la CRÉATION omet : on n'envoie pas ce qu'on n'a pas, et il n'existe aucune valeur
 * antérieure en base à effacer. Contrat inchangé, éprouvé par les tests d'AC4 de TCK-464.
 */
export function toCreatePayload(
  values: PropertyFormPayload,
  intent: 'draft' | 'submit',
): PropertyCreatePayload {
  const adresse = blocAdresse(values);

  return {
    ...corpsDuBien(values, 'omit'),
    // Reconduit tel quel le comportement d'avant TCK-464 : la modération est hors périmètre.
    status: intent === 'draft' ? 'draft' : 'pending_review',
    visibility: 'private',
    ...(adresse ? { address: adresse } : {}),
  };
}

/**
 * TCK-469 — l'ÉDITION efface : une valeur que le nouveau type ne justifie plus survivrait en base
 * sans plus aucune affordance pour la corriger depuis cet écran, le champ n'y étant plus rendu.
 * Le raisonnement complet est dans `field-matrix.ts`, au-dessus de `VALEUR_D_EFFACEMENT`.
 */
export function toUpdatePayload(values: PropertyFormPayload): PropertyUpdatePayload {
  const adresse = blocAdresse(values);

  return {
    ...corpsDuBien(values, 'erase'),
    ...(adresse ? { address: adresse } : {}),
  };
}
