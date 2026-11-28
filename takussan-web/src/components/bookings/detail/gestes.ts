import type { Booking, BookingPayment } from '@/types/booking';

/**
 * TCK-3007 (ADR-0139) — les gestes de la fiche d'une réservation, décidés UNE fois, hors du rendu
 * (patron de `components/leases/fiche/gestes.ts`).
 *
 * Chaque geste PERMIS se lit dans `abilities`, que l'API calcule pour ce lecteur, policy et état
 * compris (`GestesDeLaReservation`) : ni `useCan`, ni `user.roles`, ni le statut pour décider. La
 * fonction lit le statut et la nature pour PRÉSENTER seulement : quel geste prend la barre, lequel
 * passe dans « Autres gestes ». Tant qu'`abilities` n'est pas là, aucun geste — pas d'affichage
 * optimiste pendant un chargement (la fiche le faisait : les boutons apparaissaient, puis partaient).
 *
 * Avant : `useCanAll` sur l'agence ACTIVE et non celle de la réservation, et des capacités que la
 * policy n'exige pas — le Bailleur ne voyait ni Accepter, ni Refuser, ni Annuler, que l'API lui
 * accorde ; « Enregistrer un paiement » exigeait `payments.record` que l'API ne demandait pas.
 */

export interface GestesDeLaFiche {
  readonly accepter: boolean;
  readonly refuser: boolean;
  /** « Contre-proposer » : une offre en attente, au personnel (TCK-2876). */
  readonly contreProposer: boolean;
  readonly annuler: boolean;
  /** Le bail repris d'une candidature acceptée (P48.03, TCK-2878). */
  readonly creerLeBail: boolean;
  /**
   * « Enregistrer un paiement » : le geste principal d'un séjour confirmé (maquette e5), un geste
   * second ailleurs ; `null` sans le droit.
   */
  readonly encaisser: 'principal' | 'second' | null;
  /** « Rembourser » un séjour confirmé, tant qu'un paiement encaissé reste à rendre (TCK-2877). */
  readonly rembourserLeSejour: boolean;
  /** Rembourser une réservation fermée, paiement par paiement (`BookingRefundPanel`, TCK-596). */
  readonly rembourser: boolean;
  /** Le client règle son séjour (`CustomerPayCta`). */
  readonly payer: boolean;
  /** Le client répond à la contre-offre qui l'attend (TCK-2879). */
  readonly repondreALaContreOffre: boolean;
  /** Le client dépose une pièce manquante ; le personnel, lui, la demande. */
  readonly deposerUnePiece: boolean;
  readonly demanderUnePiece: boolean;
  readonly gererLesGarants: boolean;
  readonly laisserUnAvis: boolean;
}

export const AUCUN_GESTE: GestesDeLaFiche = {
  accepter: false,
  refuser: false,
  contreProposer: false,
  annuler: false,
  creerLeBail: false,
  encaisser: null,
  rembourserLeSejour: false,
  rembourser: false,
  payer: false,
  repondreALaContreOffre: false,
  deposerUnePiece: false,
  demanderUnePiece: false,
  gererLesGarants: false,
  laisserUnAvis: false,
};

/**
 * TCK-2877 — ce qu'un paiement peut encore rendre : son montant moins le cumul déjà remboursé
 * (TCK-1214 : un remboursement partiel laisse la ligne `paid`). Le plafond que l'API juge
 * (`booking_payment.refund_exceeds_paid`).
 */
export function plafondDuRemboursement(p: BookingPayment): number {
  return Math.max(0, Number(p.amount ?? 0) - Number(p.refund_amount ?? 0));
}

/**
 * TCK-2877 — les paiements qu'on peut encore rembourser à la main. TCK-3007 — l'API en juge par paiement
 * (`refundable` : encaissé, pas entièrement rendu, pas soldé par la plateforme) ; absent, aucun.
 */
export function paiementsRemboursables(booking: Pick<Booking, 'booking_payments'>): BookingPayment[] {
  return (booking.booking_payments ?? []).filter((p) => p.refundable === true);
}

/**
 *  | Geste | Permis par | Présenté |
 *  |---|---|---|
 *  | Accepter, Refuser | `confirm`, `reject` | dans la barre |
 *  | Contre-proposer | `counter_offer` | entre Refuser et Accepter |
 *  | Créer le bail | `create_lease` | dans la barre, si rien n'est à décider |
 *  | Enregistrer un paiement | `record_payment` | dans la barre pour un séjour confirmé, sinon second |
 *  | Rembourser le séjour | `refund` | un séjour confirmé qui a un paiement à rendre |
 *  | Annuler | `cancel` | geste second |
 */
export function gestesDeLaReservation(booking: Booking): GestesDeLaFiche {
  const a = booking.abilities;
  if (!a) return AUCUN_GESTE;

  const sejourConfirme = booking.kind === 'stay' && booking.status === 'confirmed';

  return {
    accepter: a.confirm,
    refuser: a.reject,
    contreProposer: a.counter_offer,
    annuler: a.cancel,
    creerLeBail: a.create_lease,
    encaisser: a.record_payment ? (sejourConfirme ? 'principal' : 'second') : null,
    rembourserLeSejour: a.refund && sejourConfirme && paiementsRemboursables(booking).length > 0,
    rembourser: a.refund,
    payer: a.pay,
    repondreALaContreOffre: a.answer_counter_offer,
    deposerUnePiece: a.upload_dossier_piece && !a.request_dossier_piece,
    demanderUnePiece: a.request_dossier_piece,
    gererLesGarants: a.manage_guarantors,
    laisserUnAvis: a.leave_review,
  };
}
