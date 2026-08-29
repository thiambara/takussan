import type { PropertyFormPayload } from '@/lib/schemas/property';

import { sanitizeByType, type RelevanceContext } from './field-matrix';

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
  street?: string;
  neighborhood?: string;
  city?: string;
  region?: string;
  country?: string;
  postal_code?: string;
  latitude?: number | null;
  longitude?: number | null;
};

const CLES_ADRESSE = [
  'street', 'quarter', 'city', 'region', 'country', 'postal_code', 'latitude', 'longitude',
] as const;

export type PropertyCreatePayload = Record<string, unknown> & {
  status: 'draft' | 'pending_review';
  visibility: 'private';
  address?: PropertyAddressBlock;
};

export type PropertyUpdatePayload = Record<string, unknown> & {
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
function corpsDuBien(values: PropertyFormPayload): Record<string, unknown> {
  const corps = sanitizeByType(
    { ...(values as unknown as Record<string, unknown>) },
    contexte(values),
  );
  for (const cle of CLES_ADRESSE) delete corps[cle];
  delete corps.tag_ids;
  return corps;
}

export function toCreatePayload(
  values: PropertyFormPayload,
  intent: 'draft' | 'submit',
): PropertyCreatePayload {
  const adresse = blocAdresse(values);

  return {
    ...corpsDuBien(values),
    // Reconduit tel quel le comportement d'avant TCK-464 : la modération est hors périmètre.
    status: intent === 'draft' ? 'draft' : 'pending_review',
    visibility: 'private',
    ...(adresse ? { address: adresse } : {}),
  } as PropertyCreatePayload;
}

export function toUpdatePayload(values: PropertyFormPayload): PropertyUpdatePayload {
  const adresse = blocAdresse(values);

  return {
    ...corpsDuBien(values),
    ...(adresse ? { address: adresse } : {}),
  } as PropertyUpdatePayload;
}
