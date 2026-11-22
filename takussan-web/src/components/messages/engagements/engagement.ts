/**
 * TCK-2972 (ADR-0130) — l'engagement vu du front : sa projection (`CommitmentResource`, TCK-2969 et
 * TCK-2970), la table de ses gestes, et la composition d'une échéance. Fonctions pures.
 *
 * Le front ne recalcule AUCUN droit : un geste se montre si et seulement si son `ability` est vraie dans
 * la projection rendue pour CE lecteur. La seule exception est l'impersonation (lecture seule), que
 * l'API refuse par son intergiciel sans que `abilities` le dise : l'appelant passe `lectureSeule`.
 */

/** L'état dérivé par l'API (`Commitment::etat()`) : « en retard » n'est pas un statut, c'est `late`. */
export type EtatDEngagement = 'proposed' | 'open' | 'late' | 'kept' | 'cancelled';

export type GestesDEngagement = Partial<
  Record<'confirm' | 'cancel' | 'update' | 'keep' | 'reopen' | 'not_yet' | 'remind', boolean>
>;

export interface ProjectionEngagement {
  readonly id: number;
  readonly title: string | null;
  readonly status?: string | null;
  readonly etat: EtatDEngagement;
  readonly due_at: string | null;
  readonly confirmed_at?: string | null;
  readonly kept_at?: string | null;
  readonly reopened_at?: string | null;
  readonly reopen_reason?: string | null;
  readonly holder: { readonly id: number; readonly name: string } | null;
  readonly beneficiary: { readonly id: number; readonly name: string } | null;
  readonly object?: { readonly type: string; readonly id: number } | null;
  readonly abilities?: GestesDEngagement;
}

/** Le motif d'une réouverture : 3 à 500 caractères (`reopen`, TCK-2970). */
export const MOTIF_DE_REOUVERTURE_MIN = 3;
export const MOTIF_DE_REOUVERTURE_MAX = 500;
/** `StoreCommitmentRequest::TITRE_MAX`. */
export const TITRE_MAX = 160;

/**
 * Les routes des gestes : la route DE L'ENGAGEMENT, jamais une route de la messagerie (ADR-0128 § 4).
 * Les clés d'`abilities` ne sont pas les segments de route : `keep` → `/kept`, `not_yet` → `/not-yet`,
 * `update` → `PUT /api/commitments/{id}`.
 */
export const ROUTES_DES_GESTES = {
  confirm: { methode: 'POST', segment: '/confirm' },
  cancel: { methode: 'POST', segment: '/cancel' },
  keep: { methode: 'POST', segment: '/kept' },
  reopen: { methode: 'POST', segment: '/reopen' },
  not_yet: { methode: 'POST', segment: '/not-yet' },
  remind: { methode: 'POST', segment: '/remind' },
  update: { methode: 'PUT', segment: '' },
} as const satisfies Record<keyof GestesDEngagement, { methode: 'POST' | 'PUT'; segment: string }>;

export type GesteDEngagement = keyof typeof ROUTES_DES_GESTES;

export function cheminDuGeste(id: number, geste: GesteDEngagement): string {
  return `/api/commitments/${encodeURIComponent(String(id))}${ROUTES_DES_GESTES[geste].segment}`;
}

/** Les gestes permis, lus des seules `abilities` ; aucun sous impersonation. */
export function gestesPermis(objet: ProjectionEngagement, lectureSeule: boolean): ReadonlySet<GesteDEngagement> {
  if (lectureSeule) return new Set();
  const gestes = objet.abilities ?? {};
  return new Set((Object.keys(ROUTES_DES_GESTES) as GesteDEngagement[]).filter((g) => gestes[g] === true));
}

/**
 * L'échéance saisie, en instant ISO strict (`InstantIso`) à l'heure de DAKAR (UTC+0 toute l'année, sans
 * heure d'été) : une date seule vaut la fin de ce jour (`23:59:59`), une heure la précise. `null` si la
 * date manque ou n'est pas `AAAA-MM-JJ`.
 */
export function echeanceSaisie(date: string, heure: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (heure.trim() === '') return `${date}T23:59:59+00:00`;
  if (!/^\d{2}:\d{2}$/.test(heure.trim())) return null;
  return `${date}T${heure.trim()}:00+00:00`;
}

/** Les jours entiers de retard, à l'instant (au moins 1 pour un engagement `late`). */
export function joursDeRetard(dueAt: string | null, maintenant: Date = new Date()): number {
  if (!dueAt) return 0;
  const ecart = maintenant.getTime() - new Date(dueAt).getTime();
  if (!(ecart > 0)) return 0;
  return Math.max(1, Math.floor(ecart / 86_400_000));
}

/** Un engagement clos : tenu ou annulé. Il se replie en une ligne. */
export function estClos(etat: EtatDEngagement): boolean {
  return etat === 'kept' || etat === 'cancelled';
}

/**
 * L'encre de l'état en mots, décidée ICI (une table, jamais au site de rendu — `check-status-badge-unique`) :
 * à confirmer en encre profonde, en retard en alerte, tenu en vert, le reste discret.
 */
export const ENCRE_DE_L_ETAT: Readonly<Record<EtatDEngagement, string>> = {
  proposed: 'text-primary-deep',
  open: 'text-muted-foreground',
  late: 'text-destructive',
  kept: 'text-success',
  cancelled: 'text-muted-foreground',
};

/**
 * TCK-2972 — le fil a-t-il une agence ? Sans agence, l'API refuse de noter (422 `commitment.no_agency`) :
 * « Noter un engagement » ne s'offre pas. Le contexte du fil (`GET …/context`) ne rend pas l'agence ; on
 * la déduit de ce qu'il rend : le personnel d'une agence (`can_write_team_note`), ou un objet rattaché
 * (bien, bail, intervention), d'où l'API tire l'agence (`EquipeDuFil::agence`). Contexte non lu : non.
 * ⚠ Approximation : un bien sans agence passerait, et l'API reste juge.
 */
export function filAvecAgence(
  contexte: { readonly can_write_team_note?: boolean; readonly property?: unknown; readonly lease?: unknown; readonly maintenance?: unknown } | undefined,
): boolean {
  if (!contexte) return false;
  return contexte.can_write_team_note === true || Boolean(contexte.property) || Boolean(contexte.lease) || Boolean(contexte.maintenance);
}
