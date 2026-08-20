import type { FormSelectOption } from '@/components/forms/FormSelect';
import {
  customerStatusValues,
  idTypeValues,
  pipelineStageValues,
} from '@/lib/schemas/customer';

/**
 * Le VOCABULAIRE des énumérations CRM — trois tables, un seul endroit.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * TCK-292 — « la donnée transporte la CLÉ, le rendu la résout »
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Ce module n'est PAS un composant : ni `useTranslations` (client) ni `getTranslations` (serveur)
 * n'y est appelable. C'est la situation tranchée par TCK-286 dans `src/data/navigation.ts`, puis
 * par le jumeau `src/components/property-form/options.ts` : **le module hors composant ne porte
 * plus de libellé, il porte l'espace de noms où le libellé se trouve, et une fabrique qui reçoit
 * le traducteur.**
 *
 * ```tsx
 * const tStatus = useTranslations(CUSTOMER_ENUM_NAMESPACES.status);
 * const options = customerStatusOptions(tStatus);        // [{ value: 'active', label: 'Actif' }]
 * ```
 *
 * ⚠ **Aucune clé n'a été créée pour ce module.** Les trois sous-arbres visés existaient déjà dans
 * les TROIS dictionnaires, écrits par les lots CRM : `crm.customerStatus`, `crm.pipeline.stage` et
 * `crm.idTypes`. Les 13 entrées ont été comparées une à une aux tables françaises qui vivaient ici
 * — `Actif`, `Qualifié`, `Carte d’identité`… — et elles coïncident **au caractère près**, y compris
 * l'apostrophe typographique de « Carte d’identité ». Ce module change donc d'où vient le texte,
 * et rien d'autre.
 *
 * ⚠ **`customerStatusOptions`, `pipelineStageOptions` et `idTypeOptions` n'ont aujourd'hui aucun
 * consommateur, et c'est dit plutôt que caché.** Les trois écrans CRM déjà convertis
 * (`CustomerForm`, `CustomerList`, `CustomerListFilters`) composent leurs options en ligne, chacun
 * à partir des mêmes `*Values` et des mêmes espaces de noms — les fabriques ci-dessous sont l'endroit
 * où cette répétition se rangera, pas une invention en prévision : elles ne créent aucune clé et ne
 * nomment aucun libellé. Le seul consommateur de ce module aujourd'hui est
 * `app/(dashboard)/app/customers/[id]/page.tsx`, qui appelle `enumLabel`.
 *
 * Le jumeau `property-form/options.ts` porte la même paire d'outils (`Traducteur`, `enumLabel`).
 * Elle est recopiée ici plutôt qu'importée de là-bas : un module CRM qui importerait du domaine
 * « bien » pour trois lignes de plomberie serait un couplage payé plus cher que la duplication.
 */

/**
 * Un traducteur DÉJÀ borné à son espace de noms — la valeur rendue par
 * `useTranslations('crm.customerStatus')`. Le type est volontairement plus large que celui de
 * next-intl : les clés sont ici des valeurs d'enum backend, pas des littéraux connus du typage.
 */
export type Traducteur = (cle: string) => string;

/** Où vit le libellé de chaque enum. Ne jamais recopier ces chaînes à la main ailleurs. */
export const CUSTOMER_ENUM_NAMESPACES = {
  status: 'crm.customerStatus',
  pipelineStage: 'crm.pipeline.stage',
  idType: 'crm.idTypes',
} as const;

function auxOptions<T extends string>(
  valeurs: readonly T[],
  t: Traducteur,
): FormSelectOption[] {
  return valeurs.map((v) => ({ value: v, label: t(v) }));
}

export const customerStatusOptions = (t: Traducteur): FormSelectOption[] =>
  auxOptions(customerStatusValues, t);

export const pipelineStageOptions = (t: Traducteur): FormSelectOption[] =>
  auxOptions(pipelineStageValues, t);

export const idTypeOptions = (t: Traducteur): FormSelectOption[] =>
  auxOptions(idTypeValues, t);

/**
 * Résout le libellé d'UNE valeur d'enum, en repliant sur la valeur BRUTE si le dictionnaire ne la
 * connaît pas.
 *
 * ⚠ Ce repli n'est pas une précaution de style, il reproduit un comportement existant : la table
 * qui précédait s'écrivait `CUSTOMER_STATUS_LABELS[valeur] ?? valeur`, et la valeur arrive parfois
 * d'ailleurs que de l'enum (query string, réponse d'API plus récente que le front). `t()` sur une
 * clé absente rend le CHEMIN de la clé (« crm.customerStatus.nimportequoi »), ce qui serait un
 * changement de rendu sur un cas limite — précisément ce que l'AC3 de TCK-292 interdit.
 */
export function enumLabel(
  t: Traducteur,
  valeurs: readonly string[],
  valeur: string,
): string {
  return valeurs.includes(valeur) ? t(valeur) : valeur;
}
