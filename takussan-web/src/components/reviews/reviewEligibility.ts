import type { LeaseStatus } from '@/types/lease';

/**
 * P201.03 (TCK-2037) — les statuts qui ouvrent l'avis d'un bien par un bail, recopiés de
 * `ReviewEligibility::LEASE_STATUSES` (API, ADR-0043 § 3), que juge le dépôt
 * (`StoreForPropertyReviewRequest::authorize`). L'API reste juge : ce prédicat ne décide que de
 * l'appel affiché. Un slug est exigé pour renvoyer vers la fiche publique. Celui de la réservation
 * est parti avec TCK-3007 : sa fiche lit `abilities.leave_review` (ADR-0139).
 */
const LEASE_STATUSES: readonly LeaseStatus[] = ['active', 'terminating', 'terminated', 'expired'];

export function canLeaseLeaveReview(lease: {
  status: LeaseStatus;
  property?: { slug?: string | null } | null;
}): boolean {
  return LEASE_STATUSES.includes(lease.status) && Boolean(lease.property?.slug);
}
