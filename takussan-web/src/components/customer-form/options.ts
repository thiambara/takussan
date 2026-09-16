import type { StatusTone } from '@/components/console';
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

/**
 * `étape du pipeline → ton du DS`, et `statut du client → ton du DS` (TCK-472).
 *
 * Déplacées ICI depuis `customer-dashboard/CustomerList.tsx` (revue design 2026-09-16) : la fiche
 * client — un server component — les lit aussi, et un module `'use client'` n'exporte vers le
 * serveur que des références, pas des valeurs. Ce module-ci n'a pas de directive.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE CES DEUX TABLES REMPLACENT
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `CustomerList.tsx` définissait son propre `StatusBadge` — un HOMONYME du composant de `console/`, monté
 * juste sous un `DataTable` importé de ce même barrel. `<StatusBadge …>` y résolvait vers le
 * local, et rien, ni au typage ni au lint, ne le signalait. Il coloriait quatre étapes et deux
 * statuts à la main, en quatre familles de jetons, sans lire la table des tons.
 *
 * L'écart n'était pas seulement structurel : `qualified` portait `bg-primary/5 text-primary`, qui
 * mesure **4,24:1 en clair** sur `bg-muted` plein — la surface de la carte mobile survolée de
 * `CustomerList.tsx` (`hover:bg-muted`) — et **3,73:1 en sombre**, sous le seuil AA de 4,5:1 des
 * deux côtés. Personne ne l'avait mesuré : la couleur avait été choisie ici, pas dans la table.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE CRITÈRE D'ARBITRAGE — repris tel quel de `kyc/kyc-components.tsx`
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 *   `attention` = une décision est attendue d'un opérateur.
 *   `info`      = c'est décidé, ça suit son cours, il n'y a rien à faire.
 *   `neutral`   = la fiche existe, rien n'est attendu.
 *
 * D'où `negotiating` → `attention` (il faut relancer), `qualified` → `info` (c'est engagé, ça
 * avance), `lead` et `prospect` → `neutral`.
 *
 * ⚠ **`deleted` va à `neutral` et NON à `danger`**, alors que `blocked` va à `danger`. Un client
 * supprimé est un état terminal dont plus rien n'est attendu ; un client bloqué est une décision
 * active qu'un opérateur a prise et qu'il peut lever. Les peindre pareil aurait effacé la seule
 * différence qui compte à l'écran. C'est aussi le choix qui expose le moins de surface au trou
 * mesuré du ton `danger` (cf. le docblock de `TONE_CLASSES`).
 *
 * ⚠ `active` passe de gris à `success` — il était `bg-muted text-foreground`, exactement comme
 * `deleted` et `lead`. Un statut nominal qui se peint comme l'absence de statut ne dit rien ; et
 * `available` chez le bien porte déjà `success` pour la même idée.
 */
export const PIPELINE_STAGE_TONE: Readonly<Record<string, StatusTone>> = {
  lead: 'neutral',
  prospect: 'neutral',
  qualified: 'info',
  negotiating: 'attention',
  converted: 'success',
  lost: 'danger',
};

export const CUSTOMER_STATUS_TONE: Readonly<Record<string, StatusTone>> = {
  active: 'success',
  inactive: 'neutral',
  blocked: 'danger',
  deleted: 'neutral',
};
