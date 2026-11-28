/**
 * P201.03 (TCK-2037) — le prédicat suit `ReviewEligibility::LEASE_STATUSES` (`active`, `terminating`,
 * `terminated`, `expired`) de l'API (ADR-0043 § 3) : un test par statut, les deux sens. Celui de la
 * réservation est parti avec TCK-3007 : la fiche lit `abilities.leave_review`.
 */
import { describe, it, expect } from 'vitest';
import { canLeaseLeaveReview } from '../reviewEligibility';
import type { LeaseStatus } from '@/types/lease';

const LEASE: Record<LeaseStatus, boolean> = {
  draft: false,
  pending_signature: false,
  active: true,
  expired: true,
  terminating: true,
  terminated: true,
  renewed: false,
};

describe('canLeaseLeaveReview', () => {
  it.each(Object.entries(LEASE) as [LeaseStatus, boolean][])(
    'bail %s avec un bien → %s',
    (status, attendu) => {
      expect(canLeaseLeaveReview({ status, property: { slug: 'appartement-thies' } })).toBe(attendu);
    },
  );

  it('returns false when the property slug is missing', () => {
    expect(canLeaseLeaveReview({ status: 'active' })).toBe(false);
    expect(
      canLeaseLeaveReview({ status: 'active', property: { slug: null } }),
    ).toBe(false);
  });
});
