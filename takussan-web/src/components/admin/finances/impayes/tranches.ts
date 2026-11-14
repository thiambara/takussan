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
export type CleDeTranche = 'tous' | 'plus30' | 'de8a30' | 'moins8' | 'de1a30' | 'de31a60' | 'de61a90' | 'plus90';

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

/**
 * TCK-2629 — les tranches d'ANCIENNETÉ de l'onglet « Impayés » de Rapports : celles de la balance âgée
 * (`AgingBalanceService::BUCKETS`, 1–30 · 31–60 · 61–90 · > 90), sous les mêmes filtres serveur. Les
 * quatre tranches bornées partitionnent « Tous », comme celles d'« Argent ».
 */
export const TRANCHES_ANCIENNETE: readonly Tranche[] = [
  { cle: 'tous', min: 1 },
  { cle: 'de1a30', min: 1, max: 30 },
  { cle: 'de31a60', min: 31, max: 60 },
  { cle: 'de61a90', min: 61, max: 90 },
  { cle: 'plus90', min: 91 },
];

/** Le jeu de tranches d'un montage du composant : « Argent » (par défaut) ou l'ancienneté de Rapports. */
export type JeuDeTranches = 'argent' | 'anciennete';

export const JEUX_DE_TRANCHES: Readonly<Record<JeuDeTranches, readonly Tranche[]>> = {
  argent: TRANCHES,
  anciennete: TRANCHES_ANCIENNETE,
};

/** La tranche d'ancienneté qui porte une case de la balance âgée (`buckets` de `finance/aging`). */
export const TRANCHE_DU_BUCKET = {
  '1_30': 'de1a30',
  '31_60': 'de31a60',
  '61_90': 'de61a90',
  '90_plus': 'plus90',
} as const satisfies Record<string, CleDeTranche>;

/** Au-delà de ce retard, la pastille passe au ton du danger (la maquette : « > 30 »). */
export const RETARD_GRAVE = 30;

/** Une page de la liste : 20 impayés, puis « Voir plus ». */
export const IMPAYES_PAR_PAGE = 20;

export function tranche(cle: CleDeTranche): Tranche {
  return TRANCHES.find((t) => t.cle === cle) ?? TRANCHES_ANCIENNETE.find((t) => t.cle === cle) ?? TRANCHES[0];
}
