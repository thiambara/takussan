import type { Booking, DossierPiece } from '@/types/booking';
import type { EntreeDuFil, NoteDuFil, VisiteDuFil } from '@/lib/queries/customer-timeline';

/**
 * TCK-2875 (ADR-0110) — ce que la fiche et la liste d'une candidature DÉRIVENT des clés de l'API :
 * l'alerte « Expire demain », la synthèse de la carte « Décision », l'état du geste « Demander »
 * d'une pièce, et les faits du client sur ce bien qui entrent à l'historique. Fonctions pures : le
 * texte appartient aux composants (next-intl).
 */

/** « Expire demain » : l'échéance tombe dans moins de 48 h. */
export const FENETRE_D_EXPIRATION_MS = 48 * 3_600_000;

/** « Demander » se tait 24 h après une demande (`booking.dossier_request_throttled` au-delà). */
export const DELAI_ENTRE_DEUX_DEMANDES_MS = 24 * 3_600_000;

/**
 * « Expire demain » : une demande EN ATTENTE dont l'échéance réelle (`response_deadline`, sinon
 * `expires_at`) tombe après maintenant et dans moins de 48 h. Une confirmée, une échéance passée ou
 * lointaine, ou une échéance absente : rien.
 */
export function expireBientot(b: Pick<Booking, 'status' | 'response_deadline' | 'expires_at'>, maintenant: Date): boolean {
  if (b.status !== 'pending') return false;
  const echeance = b.response_deadline ?? b.expires_at ?? null;
  if (!echeance) return false;
  const reste = Date.parse(echeance) - maintenant.getTime();
  return Number.isFinite(reste) && reste > 0 && reste < FENETRE_D_EXPIRATION_MS;
}

/**
 * La synthèse de la carte « Décision » d'une candidature. Une clé NON SERVIE (`undefined` : le lecteur
 * n'est pas du personnel de l'agence) ne dit rien ; servie et nulle, elle dit son absence.
 *  · `rapport` : le revenu rapporté au loyer — jamais le montant (ADR-0110 § 4) ;
 *  · `garant` : un garant déclaré, ou non ;
 *  · `manque` : la PREMIÈRE pièce manquante, dans l'ordre de l'API ; `null` : dossier complet.
 */
export type SyntheseDeLaCandidature = {
  readonly rapport: number | null | undefined;
  readonly garant: boolean | undefined;
  readonly manque: DossierPiece | null | undefined;
};

export function syntheseDeLaCandidature(b: Pick<Booking, 'income_to_rent_ratio' | 'has_guarantor' | 'dossier'>): SyntheseDeLaCandidature {
  return {
    rapport: b.income_to_rent_ratio,
    garant: b.has_guarantor,
    manque: b.dossier === undefined || b.dossier === null ? undefined : (b.dossier.missing[0] ?? null),
  };
}

/** Le geste « Demander » d'une pièce manquante : libre, ou tu depuis une demande de moins de 24 h. */
export function demandeeRecemment(requestedAt: string | null | undefined, maintenant: Date): boolean {
  if (!requestedAt) return false;
  const depuis = maintenant.getTime() - Date.parse(requestedAt);
  return Number.isFinite(depuis) && depuis < DELAI_ENTRE_DEUX_DEMANDES_MS;
}

/** Une visite effectuée par le client sur CE bien, lue au fil de sa fiche (TCK-2894). */
export type VisiteEffectuee = {
  readonly cle: string;
  /** Le jour de la visite (`scheduled_at`), sinon l'instant du compte rendu. */
  readonly at: string;
  readonly agent: string | null;
  readonly verdict: string | null;
  readonly note: string | null;
};

/**
 * Les visites effectuées du client sur CE bien, à mêler à l'historique de la réservation : un compte
 * rendu (`note` de nature `visit_report`) n'entre que si sa visite est une entrée `visit` du fil dont
 * le bien est celui de la réservation. Un compte rendu sans visite connue, ou d'un autre bien, n'entre
 * pas : le fil d'une note ne dit pas le bien, seule sa visite le dit.
 */
export function visitesEffectueesSurLeBien(entrees: readonly EntreeDuFil[], propertyId: number): VisiteEffectuee[] {
  const visites = new Map<number, VisiteDuFil>();
  for (const e of entrees) {
    if (e.type === 'visit' && e.property?.id === propertyId && !visites.has(e.id)) visites.set(e.id, e);
  }
  const vues = new Set<number>();
  const faits: VisiteEffectuee[] = [];
  for (const e of entrees) {
    if (e.type !== 'note' || e.kind !== 'visit_report') continue;
    const visitId = (e as NoteDuFil).report?.visit_id ?? e.property_visit_id;
    if (visitId === null || visitId === undefined || vues.has(visitId)) continue;
    const visite = visites.get(visitId);
    if (!visite) continue;
    vues.add(visitId);
    faits.push({
      cle: `visite-${visitId}`,
      at: visite.scheduled_at ?? e.at,
      agent: e.author?.name ?? null,
      verdict: e.report?.outcome ?? null,
      note: e.body?.trim() || null,
    });
  }
  return faits;
}

/* ─────────────────────────── TCK-2878 — la candidature arrive, puis le bail ─────────────────────────── */

/** TCK-2878 — les demandes de contact du client sur CE bien (`lead_message` du fil, dont l'API sert le bien). */
export function demandesSurLeBien(entrees: readonly EntreeDuFil[], propertyId: number): { readonly cle: string; readonly at: string }[] {
  return entrees
    .filter((e): e is NoteDuFil => e.type === 'note' && e.kind === 'lead_message' && e.property?.id === propertyId)
    .map((e) => ({ cle: `demande-${e.id}`, at: e.at }));
}

/**
 * TCK-2878 — la fin d'un bail repris d'une candidature : début + `term_months`, veille comprise, sans
 * débordement de mois (31 janv. + 1 mois → 28 févr., puis la veille) — la convention de
 * `LeaseService::create` (`addMonthsNoOverflow()->subDay()`). Jours `AAAA-MM-JJ`, sans fuseau.
 */
export function finDuTerme(debut: string, mois: number): string {
  const [a, m, j] = debut.split('-').map((x) => Number.parseInt(x, 10));
  const cible = new Date(Date.UTC(a, m - 1 + mois, 1));
  const dernierDuMois = new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0)).getUTCDate();
  const jour = new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth(), Math.min(j, dernierDuMois) - 1));
  return jour.toISOString().slice(0, 10);
}

/** Un montant de l'API (nombre, ou chaîne décimale) en nombre ; `null` s'il n'en est pas un. */
function montantLu(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * TCK-2878 (ADR-0102 § 3, TCK-2894) — ce que le bail reprend d'une CANDIDATURE : le loyer qu'elle
 * propose (le prix du bien à sa création, jamais le prix courant du bien), sa caution, son début et la
 * fin de son terme. Une clé absente (caution non dite, terme inconnu) ne se reprend pas : l'API la
 * reprendrait elle-même, ou le bail la demande.
 */
export function termesDuBailRepris(
  b: Pick<Booking, 'kind' | 'total_amount' | 'security_deposit_amount' | 'start_date' | 'end_date' | 'term_months'>,
): { readonly monthly_rent?: number; readonly deposit_amount?: number; readonly start_date?: string; readonly end_date?: string } {
  if (b.kind !== 'application') return {};
  const loyer = montantLu(b.total_amount);
  const caution = montantLu(b.security_deposit_amount);
  const debut = b.start_date?.slice(0, 10) || undefined;
  const fin = b.end_date?.slice(0, 10) || (debut && b.term_months ? finDuTerme(debut, b.term_months) : undefined);
  return {
    ...(loyer !== null && loyer > 0 ? { monthly_rent: loyer } : {}),
    ...(caution !== null ? { deposit_amount: caution } : {}),
    ...(debut ? { start_date: debut } : {}),
    ...(fin ? { end_date: fin } : {}),
  };
}

/**
 * TCK-2878 — « reçue il y a 13 h · réponse attendue sous 35 h » : le temps qui reste avant l'échéance
 * réelle (`response_deadline`), en heures entamées ; `null` hors d'une demande en attente ou sans
 * échéance ; `0` une fois l'échéance passée.
 */
export function heuresAvantLaReponse(b: Pick<Booking, 'status' | 'response_deadline'>, maintenant: Date): number | null {
  if (b.status !== 'pending' || !b.response_deadline) return null;
  const reste = Date.parse(b.response_deadline) - maintenant.getTime();
  if (!Number.isFinite(reste)) return null;
  return reste <= 0 ? 0 : Math.ceil(reste / 3_600_000);
}
