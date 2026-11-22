import { enumLabel, type Traducteur } from '@/components/property-form/options';
import {
  conditionValues,
  contractTypeValues,
  propertyStatusFilterValues,
  propertyTypeValues,
  rentPeriodValues,
  titleTypeValues,
} from '@/lib/enums/property';

/**
 * TCK-351 (option a du porteur, 2026-11-16) — le front possède le texte affiché d'un bien.
 *
 * `PropertyResource` émettait six libellés traduits côté serveur (`type_label`,
 * `contract_type_label`, `rent_period_label`, `status_label`, `title_type_label`,
 * `condition_label`) pendant que les cartes et les filtres rendaient le dictionnaire du front :
 * deux tables, 44 divergences, et `pending` affiché « Réservé » sur la fiche et « En attente » sur la
 * carte. L'API n'émet plus que les CODES ; ce module dit où chacun se traduit.
 *
 * `property-labels.parity.test.ts` garde les deux sens : aucun fichier du front ne relit un `*_label`
 * de bien, et chaque cas d'enum de l'API a sa clé dans `fr`, `en` et `wo`.
 */
export const ESPACES_DES_LIBELLES_DE_BIEN = {
  type: 'property.types',
  contract_type: 'property.contractTypes',
  rent_period: 'property.rentPeriods',
  status: 'property.status',
  title_type: 'property.titleTypes',
  condition: 'property.conditions',
} as const;

export type ChampLibelleDeBien = keyof typeof ESPACES_DES_LIBELLES_DE_BIEN;

const CODES: Record<ChampLibelleDeBien, readonly string[]> = {
  type: propertyTypeValues,
  contract_type: contractTypeValues,
  rent_period: rentPeriodValues,
  status: propertyStatusFilterValues,
  title_type: titleTypeValues,
  condition: conditionValues,
};

/**
 * Le libellé d'un code de bien, par un traducteur DÉJÀ borné à `ESPACES_DES_LIBELLES_DE_BIEN[champ]`.
 * `null` sans code (colonne non demandée ou nulle) ; un code inconnu du front sort brut (`enumLabel`),
 * jamais en chemin de clé.
 */
export function libelleDeBien(
  t: Traducteur,
  champ: ChampLibelleDeBien,
  code: string | null | undefined,
): string | null {
  if (!code) return null;
  return enumLabel(t, CODES[champ], code);
}

/**
 * « En vente » / « En location » — la forme LONGUE que portent la pastille des cartes
 * (`ContractTypeChip`) et les puces de transaction : la fiche reprend le même mot que la carte qui y
 * mène. `t` est borné à `property.contractTypes`.
 */
export function libelleLongDuContrat(t: Traducteur, code: string | null | undefined): string | null {
  if (code === 'sale') return t('saleLong');
  if (code === 'rent') return t('rentLong');
  return code ?? null;
}
