/**
 * TCK-2678 (ADR-0097 § 5) — les codes de motif d'un bien hors ligne (`offline_reasons`, servi par l'API
 * sur `include=offlineReasons`), dans l'ordre où l'API les rend : chacun est une condition de
 * `Property::conditionsEnLigne()` que le bien ne remplit pas. L'écran ne les recompose JAMAIS à partir
 * du statut ou de la visibilité : il les traduit, c'est tout.
 *
 * La liste est confrontée à l'API par `motifs-hors-ligne.tck-2678.test.ts`, qui lit `Property.php`.
 */
export const MOTIFS_HORS_LIGNE = [
  'agency_inactive',
  'status_draft',
  'status_sold',
  'status_rented',
  'status_archived',
  'status_under_maintenance',
  'status_unavailable',
  'status_pending_review',
  'status_rejected',
  'not_published',
  'private',
  'test',
] as const;

export type MotifHorsLigne = (typeof MOTIFS_HORS_LIGNE)[number];

const CONNUS: ReadonlySet<string> = new Set(MOTIFS_HORS_LIGNE);

/**
 * La clé de la phrase d'un motif, sous `property.dashboard.horsLigne`. Un code que le front ne connaît
 * pas encore se dit « Hors ligne. », sans erreur ni clé brute.
 */
export function cleDuMotif(code: string): `phrase.${MotifHorsLigne | 'inconnu'}` {
  return `phrase.${CONNUS.has(code) ? (code as MotifHorsLigne) : 'inconnu'}`;
}

/** Les phrases des motifs, dans l'ordre de l'API, sans doublon (deux codes inconnus ne disent pas deux fois « Hors ligne. »). */
export function phrasesDesMotifs(motifs: readonly string[], t: (cle: ReturnType<typeof cleDuMotif>) => string): string[] {
  return [...new Set(motifs.map((m) => t(cleDuMotif(m))))];
}
