import type { BookingStatus } from '@/types/booking';
import type { LeaseStatus } from '@/types/lease';

/**
 * A booking is review-eligible once it is `completed` and actually references
 * a property (we need a slug to deep-link to the public page). Backend still
 * enforces the rule — this predicate just drives the UI affordance.
 */
export function canBookingLeaveReview(booking: {
  status: BookingStatus;
  property?: { slug?: string | null } | null;
}): boolean {
  return booking.status === 'completed' && Boolean(booking.property?.slug);
}

/**
 * A lease is review-eligible while active (during the stay) or after it has
 * ended (expired/terminated/renewed). Drafts and leases awaiting signature
 * are not eligible yet. Mirrors `ReviewController@storeForProperty`.
 */
export function canLeaseLeaveReview(lease: {
  status: LeaseStatus;
  property?: { slug?: string | null } | null;
}): boolean {
  const eligibleStatuses: LeaseStatus[] = ['active', 'expired', 'terminated', 'renewed'];
  return eligibleStatuses.includes(lease.status) && Boolean(lease.property?.slug);
}
