/**
 * P201.03 (TCK-2037) — les prédicats suivent `ReviewEligibility::BOOKING_STATUSES`
 * (`confirmed`, `completed`) et `LEASE_STATUSES` (`active`, `terminating`, `terminated`,
 * `expired`) de l'API (ADR-0043 § 3) : un test par statut, les deux sens.
 */
import { describe, it, expect } from 'vitest';
import {
  canBookingLeaveReview,
  canLeaseLeaveReview,
} from '../reviewEligibility';
import type { BookingStatus } from '@/types/booking';
import type { LeaseStatus } from '@/types/lease';

const BOOKING: Record<BookingStatus, boolean> = {
  pending: false,
  confirmed: true,
  rejected: false,
  cancelled: false,
  expired: false,
  completed: true,
};

const LEASE: Record<LeaseStatus, boolean> = {
  draft: false,
  pending_signature: false,
  active: true,
  expired: true,
  terminating: true,
  terminated: true,
  renewed: false,
};

describe('canBookingLeaveReview', () => {
  it.each(Object.entries(BOOKING) as [BookingStatus, boolean][])(
    'réservation %s avec un bien → %s',
    (status, attendu) => {
      expect(canBookingLeaveReview({ status, property: { slug: 'villa-dakar' } })).toBe(attendu);
    },
  );

  it('returns false when the property slug is missing', () => {
    expect(canBookingLeaveReview({ status: 'completed' })).toBe(false);
    expect(
      canBookingLeaveReview({ status: 'completed', property: null }),
    ).toBe(false);
    expect(
      canBookingLeaveReview({ status: 'completed', property: { slug: null } }),
    ).toBe(false);
  });
});

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
