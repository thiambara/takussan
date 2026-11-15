import type { StatusTone } from '@/components/console';
import type { BookingPaymentStatus, BookingStatus } from '@/types/booking';

/**
 * TCK-292 — tables hors composant : elles transportent la CLÉ (relative au namespace `bookings`),
 * le rendu la résout. Partagées par la liste et le détail : un seul vocabulaire de statut.
 */
export const BOOKING_STATUS_LABEL_KEY: Record<BookingStatus, string> = {
  pending: 'status.pending',
  confirmed: 'status.confirmed',
  rejected: 'status.rejected',
  cancelled: 'status.cancelled',
  expired: 'status.expired',
  completed: 'status.completed',
};

/**
 * Revue design 2026-09-16 — les statuts se peignaient en variantes de `Badge` : « Confirmée »
 * prenait l'aplat terracotta de la marque, et « Annulée » et « Expirée » le même gris que le
 * reste. Le ton passe par `StatusBadge` (TCK-472).
 *
 * TCK-2594 — les tons de la maquette retenue (`app-reservations`, `TON_ETAT`) : « À décider »
 * demande une décision, « Confirmée » est un succès (la demande a abouti), « Terminée » est close,
 * au neutre comme une annulée ou une expirée ; « Refusée » seule est un refus.
 */
export const BOOKING_STATUS_TONE: Record<BookingStatus, StatusTone> = {
  pending: 'attention',
  confirmed: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
  expired: 'neutral',
  completed: 'neutral',
};

/** Ton d'un paiement de réservation ; un statut inconnu de l'API retombe sur le neutre. */
export const BOOKING_PAYMENT_STATUS_TONE: Record<BookingPaymentStatus, StatusTone> = {
  pending: 'attention',
  paid: 'success',
  late: 'danger',
  partially_paid: 'attention',
  failed: 'danger',
  refunded: 'info',
  cancelled: 'neutral',
};
