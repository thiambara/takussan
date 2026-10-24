import type { BookingStatus } from '@/types/booking';
import type { LeaseStatus } from '@/types/lease';

/**
 * P201.03 (TCK-2037) — les statuts qui ouvrent l'avis d'un bien, recopiés de
 * `ReviewEligibility::BOOKING_STATUSES` et `LEASE_STATUSES` (API, ADR-0043 § 3), que juge le dépôt
 * (`StoreForPropertyReviewRequest::authorize`). L'API reste juge : ces prédicats ne décident que de
 * l'appel affiché. Un slug est exigé pour renvoyer vers la fiche publique.
 */
const BOOKING_STATUSES: readonly BookingStatus[] = ['confirmed', 'completed'];

const LEASE_STATUSES: readonly LeaseStatus[] = ['active', 'terminating', 'terminated', 'expired'];

export function canBookingLeaveReview(booking: {
  status: BookingStatus;
  property?: { slug?: string | null } | null;
}): boolean {
  return BOOKING_STATUSES.includes(booking.status) && Boolean(booking.property?.slug);
}

export function canLeaseLeaveReview(lease: {
  status: LeaseStatus;
  property?: { slug?: string | null } | null;
}): boolean {
  return LEASE_STATUSES.includes(lease.status) && Boolean(lease.property?.slug);
}
