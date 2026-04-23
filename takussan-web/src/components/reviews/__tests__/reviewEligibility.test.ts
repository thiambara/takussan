import { describe, it, expect } from 'vitest';
import {
  canBookingLeaveReview,
  canLeaseLeaveReview,
} from '../reviewEligibility';

describe('canBookingLeaveReview', () => {
  it('returns true when booking is completed and property has a slug', () => {
    expect(
      canBookingLeaveReview({
        status: 'completed',
        property: { slug: 'villa-dakar' },
      }),
    ).toBe(true);
  });

  it('returns false for non-completed bookings, even with a valid slug', () => {
    for (const status of ['pending', 'confirmed', 'rejected', 'cancelled', 'expired'] as const) {
      expect(
        canBookingLeaveReview({ status, property: { slug: 'villa-dakar' } }),
      ).toBe(false);
    }
  });

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
  it('returns true for active leases with a slug', () => {
    expect(
      canLeaseLeaveReview({
        status: 'active',
        property: { slug: 'appartement-thies' },
      }),
    ).toBe(true);
  });

  it('returns true for past leases (expired/terminated/renewed)', () => {
    for (const status of ['expired', 'terminated', 'renewed'] as const) {
      expect(
        canLeaseLeaveReview({ status, property: { slug: 'appartement-thies' } }),
      ).toBe(true);
    }
  });

  it('returns false for draft or pending_signature leases', () => {
    for (const status of ['draft', 'pending_signature'] as const) {
      expect(
        canLeaseLeaveReview({ status, property: { slug: 'appartement-thies' } }),
      ).toBe(false);
    }
  });

  it('returns false when the property slug is missing', () => {
    expect(canLeaseLeaveReview({ status: 'active' })).toBe(false);
    expect(
      canLeaseLeaveReview({ status: 'active', property: { slug: null } }),
    ).toBe(false);
  });
});
