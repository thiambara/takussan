/**
 * TCK-2594 (ADR-0102) — les règles de la liste des réservations, hors composant : la nature et le
 * statut qui s'ouvrent, le montant dans les mots de la nature, l'âge d'une demande, les groupes de
 * « Mes réservations ». Les libellés restent au rendu ; ici, seulement des valeurs.
 */
import { ecartAuPrix } from './saisie-de-demande';

export type NatureDeReservation = 'stay' | 'application' | 'offer';
export type StatutDeReservation = 'pending' | 'confirmed' | 'completed' | 'rejected' | 'cancelled' | 'expired';

/** L'ordre du segmenté : Séjours · Candidatures · Offres. */
export const NATURES: readonly NatureDeReservation[] = ['stay', 'application', 'offer'];

/** L'ordre des pastilles : « À décider » d'abord, puis Confirmées, Terminées, Refusées, Annulées, Expirées. */
export const STATUTS: readonly StatutDeReservation[] = ['pending', 'confirmed', 'completed', 'rejected', 'cancelled', 'expired'];

/** `GET /api/bookings/counts` : un compte par nature × statut, toutes les cases présentes. */
export type ComptesDesReservations = Record<NatureDeReservation, Record<StatutDeReservation, number>>;

export function comptesVides(): ComptesDesReservations {
  const ligne = (): Record<StatutDeReservation, number> => ({ pending: 0, confirmed: 0, completed: 0, rejected: 0, cancelled: 0, expired: 0 });
  return { stay: ligne(), application: ligne(), offer: ligne() };
}

export function natureDeLUrl(valeur: string | null): NatureDeReservation | null {
  return NATURES.find((n) => n === valeur) ?? null;
}

export function statutDeLUrl(valeur: string | null): StatutDeReservation | null {
  return STATUTS.find((s) => s === valeur) ?? null;
}

const total = (ligne: Record<StatutDeReservation, number>) => STATUTS.reduce((somme, s) => somme + (ligne[s] ?? 0), 0);

/**
 * La nature ouverte : celle de `?kind=` ; sinon la première qui a une demande à décider ; sinon la
 * première non vide ; sinon Séjours. `null` tant que les comptes ne sont pas lus — la liste attend
 * plutôt que de lire deux fois. Des comptes illisibles ouvrent Séjours.
 */
export function natureOuverte(demandee: NatureDeReservation | null, comptes: ComptesDesReservations | null, illisibles = false): NatureDeReservation | null {
  if (demandee) return demandee;
  if (!comptes) return illisibles ? 'stay' : null;
  return NATURES.find((n) => comptes[n].pending > 0) ?? NATURES.find((n) => total(comptes[n]) > 0) ?? 'stay';
}

/**
 * Le statut ouvert : celui de `?status=`, même vide (le lien « À décider » du bailleur y reste) ;
 * sinon « À décider » s'il a des demandes, sinon « Confirmées » (l'audit relève l'ouverture sur un
 * onglet vide). `null` tant que les comptes ne sont pas lus ; illisibles : « À décider ».
 */
export function statutOuvert(demande: StatutDeReservation | null, comptes: Record<StatutDeReservation, number> | null, illisibles = false): StatutDeReservation | null {
  if (demande) return demande;
  if (!comptes) return illisibles ? 'pending' : null;
  return comptes.pending > 0 ? 'pending' : 'confirmed';
}

/** Le jour civil d'une date ou d'un instant de l'API (`2026-11-12` ou `2026-11-12T14:00:00+00:00`). */
function jourCivil(valeur: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valeur);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** Les nuits d'un séjour, en jours civils ; `null` si l'une manque ou si la fin ne suit pas le début. */
export function nuitsEntre(debut: string | null | undefined, fin: string | null | undefined): number | null {
  if (!debut || !fin) return null;
  const a = jourCivil(debut);
  const b = jourCivil(fin);
  if (a === null || b === null || b <= a) return null;
  return Math.round((b - a) / 86_400_000);
}

export type MontantDansLaNature =
  | { readonly forme: 'nuits'; readonly nuits: number; readonly montant: number | null }
  | { readonly forme: 'loyer'; readonly montant: number | null }
  | { readonly forme: 'offre'; readonly montant: number | null; readonly affiche: number | null; readonly ecart: number | null }
  | { readonly forme: 'montant'; readonly montant: number | null };

export interface ReservationPourLeMontant {
  readonly kind?: NatureDeReservation | null;
  readonly total_amount?: number | null;
  readonly list_price_at_booking?: number | null;
  readonly start_date?: string | null;
  readonly end_date?: string | null;
}

/**
 * Le montant dans le vocabulaire de la nature (ADR-0102 § 3) : « 3 nuits · 165 000 F » pour un
 * séjour, « Loyer 250 000 F/mois » pour une candidature (son montant est le loyer du bien),
 * « Offre 85 000 000 F » et son écart au prix affiché pour une offre.
 */
export function montantDansLaNature(b: ReservationPourLeMontant): MontantDansLaNature {
  const montant = b.total_amount ?? null;
  if (b.kind === 'stay') {
    const nuits = nuitsEntre(b.start_date, b.end_date);
    return nuits === null ? { forme: 'montant', montant } : { forme: 'nuits', nuits, montant };
  }
  if (b.kind === 'application') return { forme: 'loyer', montant };
  if (b.kind === 'offer') {
    const affiche = b.list_price_at_booking ?? null;
    return { forme: 'offre', montant, affiche, ecart: ecartAuPrix(montant, affiche) };
  }
  return { forme: 'montant', montant };
}

export type AgeDeLaDemande = { readonly unite: 'min' | 'h' | 'hier' | 'j' | 'date'; readonly n: number };

const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;

/**
 * L'âge d'une demande : « il y a 20 min », « il y a 2 h », « hier », « il y a 4 j » ; au-delà d'une
 * semaine, la date (`date`). Le jour d'hier se compte en jours civils à Dakar (UTC).
 */
export function ageDeLaDemande(creee: string, maintenant: Date): AgeDeLaDemande {
  const instant = Date.parse(creee);
  if (Number.isNaN(instant)) return { unite: 'date', n: 0 };
  const ecart = Math.max(0, maintenant.getTime() - instant);
  if (ecart < HEURE) return { unite: 'min', n: Math.max(1, Math.floor(ecart / MINUTE)) };
  const jours = Math.round((Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate()) - jourCivil(new Date(instant).toISOString())!) / JOUR);
  if (jours === 0) return { unite: 'h', n: Math.floor(ecart / HEURE) };
  if (jours === 1) return { unite: 'hier', n: 1 };
  if (jours < 7) return { unite: 'j', n: jours };
  return { unite: 'date', n: 0 };
}

/** « Mes réservations » (client) : trois groupes qui couvrent les six statuts. */
export type GroupeDuClient = 'en_cours' | 'terminees' | 'annulees';

export const GROUPES_DU_CLIENT: readonly GroupeDuClient[] = ['en_cours', 'terminees', 'annulees'];

export const STATUTS_DU_GROUPE: Readonly<Record<GroupeDuClient, readonly StatutDeReservation[]>> = {
  en_cours: ['pending', 'confirmed'],
  terminees: ['completed'],
  annulees: ['cancelled', 'rejected', 'expired'],
};

export function groupeDuClient(statut: StatutDeReservation): GroupeDuClient {
  return GROUPES_DU_CLIENT.find((g) => STATUTS_DU_GROUPE[g].includes(statut)) ?? 'en_cours';
}

export function groupeDeLUrl(valeur: string | null): GroupeDuClient | null {
  return GROUPES_DU_CLIENT.find((g) => g === valeur) ?? null;
}

/** Le compte d'un groupe, toutes natures confondues. */
export function compteDuGroupe(comptes: ComptesDesReservations, groupe: GroupeDuClient): number {
  return NATURES.reduce((somme, n) => somme + STATUTS_DU_GROUPE[groupe].reduce((s, st) => s + (comptes[n][st] ?? 0), 0), 0);
}
