import type { StatusTone } from '@/components/console';
import type { BookingStatus } from '@/types/booking';

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
 * reste. Le ton passe par `StatusBadge` (TCK-472), avec le même sens que les visites :
 * « en attente » demande une décision, « confirmée » est une information, « terminée » un succès.
 */
export const BOOKING_STATUS_TONE: Record<BookingStatus, StatusTone> = {
  pending: 'attention',
  confirmed: 'info',
  rejected: 'danger',
  cancelled: 'neutral',
  expired: 'neutral',
  completed: 'success',
};

/** Ton d'un paiement de réservation ; un statut inconnu de l'API retombe sur le neutre. */
export const BOOKING_PAYMENT_STATUS_TONE: Record<string, StatusTone> = {
  pending: 'attention',
  paid: 'success',
  partially_paid: 'attention',
  refunded: 'info',
  cancelled: 'neutral',
};
