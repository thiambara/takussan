import type { FormSelectOption } from '@/components/forms/FormSelect';
import {
  contractTypeValues,
  currencyValues,
  propertyStatusValues,
  propertyTypeValues,
  propertyVisibilityValues,
  rentPeriodValues,
} from '@/lib/schemas/property';

/**
 * Le VOCABULAIRE des énumérations de bien — six tables, un seul endroit.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * TCK-292 — « la donnée transporte la CLÉ, le rendu la résout »
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Ce module est importé par une dizaine de composants répartis sur TROIS lots du chantier i18n, et
 * il n'est PAS un composant : ni `useTranslations` (client) ni `getTranslations` (serveur) n'y est
 * appelable. C'est exactement la situation que TCK-286 a tranchée dans `src/data/navigation.ts` et
 * `src/components/layout/AppSidebar.tsx` : **le module hors composant ne porte plus de libellé, il
 * porte l'espace de noms où le libellé se trouve, et une fabrique qui reçoit le traducteur.**
 *
 * Côté appelant, cela tient en deux lignes :
 *
 * ```tsx
 * const tType = useTranslations(PROPERTY_ENUM_NAMESPACES.type);
 * const typeOptions = propertyTypeOptions(tType);          // [{ value: 'villa', label: 'Villa' }]
 * ```
 *
 * ⚠ **`property.visibility` et `property.visibilityScope` sont DEUX vocabulaires pour le même
 * enum**, et c'est délibéré : le formulaire et la liste disent « Publié / Brouillon » là où les
 * badges et les filtres disent « Public / Privé ». Les deux existaient déjà à l'écran avant ce
 * ticket ; TCK-292 ne change aucun rendu, il se contente de les nommer. Les unifier est une
 * décision produit, pas un nettoyage. Même remarque pour `property.rentPeriodUnits`
 * (« Jour / Semaine / Mois / Année », vocabulaire du formulaire) face à `property.rentPeriods`
 * (« Journalier / Hebdo… ») et `property.rentPeriodsShort` (« jour / sem. … »).
 */

/**
 * Un traducteur DÉJÀ borné à son espace de noms — la valeur rendue par
 * `useTranslations('property.types')`. Le type est volontairement plus large que celui de
 * next-intl : les clés sont ici des valeurs d'enum backend, pas des littéraux connus du typage.
 */
export type Traducteur = (cle: string) => string;

/** Où vit le libellé de chaque enum. Ne jamais recopier ces chaînes à la main ailleurs. */
export const PROPERTY_ENUM_NAMESPACES = {
  type: 'property.types',
  contractType: 'property.contractTypes',
  status: 'property.status',
  /** « Publié / Brouillon » — vocabulaire de l'état de publication (formulaire, liste). */
  visibility: 'property.visibility',
  /** « Public / Privé » — vocabulaire de la portée (badges, filtres). */
  visibilityScope: 'property.visibilityScope',
  rentPeriod: 'property.rentPeriodUnits',
  currency: 'property.currencies',
  /** Statut foncier (`title_type`) — champ conditionnel de `StepCaracteristiques` (TCK-464). */
  titleType: 'property.titleTypes',
  /**
   * « Vendre / Louer » — SECOND vocabulaire de `contract_type`, employé par `StepBien` (TCK-464).
   * Même motif que `visibility` / `visibilityScope` juste au-dessus : le mot varie avec l'écran
   * (une question posée à quelqu'un répond mieux à un verbe qu'à un substantif), la valeur ne
   * varie pas. `contractType` reste le vocabulaire substantif (« Vente / Location ») des listes et
   * des badges.
   */
  contractTypeWizard: 'property.wizard.contract',
  /**
   * Le type de bien précédé de son ARTICLE (« du terrain », « de la maison ») — vocabulaire du
   * titre de l'étape « Caractéristiques » du parcours de publication (TCK-464). Second vocabulaire
   * de `type`, même motif que `contractTypeWizard` juste au-dessus : la valeur ne varie pas, le mot
   * varie avec la phrase qui l'accueille.
   */
  typeArticle: 'property.wizard.typeArticle',
} as const;

function auxOptions<T extends string>(
  valeurs: readonly T[],
  t: Traducteur,
): FormSelectOption[] {
  return valeurs.map((v) => ({ value: v, label: t(v) }));
}

export const propertyTypeOptions = (t: Traducteur): FormSelectOption[] =>
  auxOptions(propertyTypeValues, t);

export const contractTypeOptions = (t: Traducteur): FormSelectOption[] =>
  auxOptions(contractTypeValues, t);

export const propertyStatusOptions = (t: Traducteur): FormSelectOption[] =>
  auxOptions(propertyStatusValues, t);

export const propertyVisibilityOptions = (t: Traducteur): FormSelectOption[] =>
  auxOptions(propertyVisibilityValues, t);

export const rentPeriodOptions = (t: Traducteur): FormSelectOption[] =>
  auxOptions(rentPeriodValues, t);

export const currencyOptions = (t: Traducteur): FormSelectOption[] =>
  auxOptions(currencyValues, t);

/**
 * Résout le libellé d'UNE valeur d'enum, en repliant sur la valeur BRUTE si le dictionnaire ne la
 * connaît pas.
 *
 * ⚠ Ce repli n'est pas une précaution de style, il reproduit un comportement existant. Les tables
 * de libellés qui précédaient s'écrivaient `TABLE[valeur] ?? valeur`, et la valeur arrive parfois
 * d'ailleurs que de l'enum : d'une query string (`?status=nimportequoi`) ou d'une réponse d'API
 * plus récente que le front. `t()` sur une clé absente rend le CHEMIN de la clé
 * (« property.status.nimportequoi »), ce qui serait un changement de rendu sur un cas limite —
 * précisément ce que l'AC3 de TCK-292 interdit.
 */
export function enumLabel(
  t: Traducteur,
  valeurs: readonly string[],
  valeur: string,
): string {
  return valeurs.includes(valeur) ? t(valeur) : valeur;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE BLOC DE COMPATIBILITÉ A ÉTÉ SUPPRIMÉ (TCK-292, lot FIX-OPTIONS)
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Six tables françaises (`PROPERTY_TYPE_LABELS`, `CONTRACT_TYPE_LABELS`, `PROPERTY_STATUS_LABELS`,
 * `PROPERTY_VISIBILITY_LABELS`, `RENT_PERIOD_LABELS`, `CURRENCY_LABELS`) et les six `*_OPTIONS`
 * qui en dérivaient vivaient ici. Elles portaient les 8 dernières occurrences de texte en dur du
 * fichier, et elles n'étaient pas retenues par une difficulté propre : elles étaient retenues par
 * TROIS CONSOMMATEURS APPARTENANT À D'AUTRES LOTS, que le découpage du chantier interdisait de
 * toucher depuis le lot qui possédait ce fichier.
 *
 * *Les douze lots de TCK-292 sont disjoints par FICHIER ; le code ne l'est pas par DÉPENDANCE.*
 * C'est la limite que ce module a exposée, et elle a été tranchée dans le sens n° 2 du ticket :
 * **un commit croise les lots quand un module partagé l'impose.** Les trois consommateurs ont donc
 * migré dans le même geste :
 *
 * | fichier                                             | lot | ce qu'il consommait |
 * |-----------------------------------------------------|-----|---------------------|
 * | `components/property-form/PropertyForm`              |  B  | `PROPERTY_TYPE_LABELS`, `CONTRACT_TYPE_LABELS`, `CURRENCY_OPTIONS`, `RENT_PERIOD_OPTIONS` |
 * | `components/profile/SearchPreferencesForm`           |  E  | `PROPERTY_TYPE_LABELS` |
 * | `components/admin/super/SuperAdminPropertiesFilters` |  A  | `PROPERTY_TYPE_OPTIONS`, `PROPERTY_STATUS_OPTIONS`, `PROPERTY_VISIBILITY_OPTIONS` |
 *
 * ⚠ **Ce que la suppression change à l'écran, exhaustivement — et ce n'est pas rien.**
 * Les 36 entrées des six tables (16 + 2 + 8 + 2 + 4 + 4) ont été comparées une à une aux
 * sous-arbres du dictionnaire :
 * 34 coïncident au caractère près, **2 divergent**, et ce sont les deux que TCK-292 avait déjà
 * tranchées — `PROPERTY_TYPE_LABELS.shop` disait « Boutique » là où `property.types.shop` dit
 * « Commerce », et `.resort` disait « Resort » là où le dictionnaire dit « Complexe ». Le
 * dictionnaire gagne, décision du ticket. Concrètement, **deux libellés changent sur les trois
 * écrans ci-dessus** : le sélecteur de type du formulaire de bien, la liste de types des
 * préférences de recherche, et le filtre « Type » de la console super-admin.
 *
 * *Ce n'est pas le texte qui avait bougé, c'était sa SOURCE* — et c'est précisément le genre
 * d'écart qu'une vérification « littéral supprimé ↔ valeur du dictionnaire » ne voit PAS, puisque
 * « Commerce » n'a jamais été un littéral de ce fichier. La comparaison se fait table contre table,
 * entrée par entrée.
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */
