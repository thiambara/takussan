/**
 * TCK-2660 — les pastilles de retard des impayés, filtrées CÔTÉ SERVEUR par `filter[days_late_min]`
 * et `filter[days_late_max]` (bornes incluses).
 *
 * Toutes partent de la règle *Impayé* partagée (`days_late_min ≥ 1` : échéance due, non soldée, échue
 * avant aujourd'hui à Dakar — `OverdueInstalment`), celle de la balance âgée, du compte de l'onglet et
 * du point du mois. JAMAIS `filter[status]=late` : une échéance échue reste `pending` tant que le job
 * de retard ne l'a pas basculée, et ne l'est jamais sur un bail sans pénalité (la leçon de TCK-595).
 * Les trois tranches bornées partitionnent « Tous ».
 */
export type CleDeTranche = 'tous' | 'plus30' | 'de8a30' | 'moins8';

export interface Tranche {
  readonly cle: CleDeTranche;
  readonly min: number;
  readonly max?: number;
}

export const TRANCHES: readonly Tranche[] = [
  { cle: 'tous', min: 1 },
  { cle: 'plus30', min: 31 },
  { cle: 'de8a30', min: 8, max: 30 },
  { cle: 'moins8', min: 1, max: 7 },
];

/** Au-delà de ce retard, la pastille passe au ton du danger (la maquette : « > 30 »). */
export const RETARD_GRAVE = 30;

/** Une page de la liste : 20 impayés, puis « Voir plus ». */
export const IMPAYES_PAR_PAGE = 20;

export function tranche(cle: CleDeTranche): Tranche {
  return TRANCHES.find((t) => t.cle === cle) ?? TRANCHES[0];
}
