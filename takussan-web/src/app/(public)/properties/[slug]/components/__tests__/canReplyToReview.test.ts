import { describe, it, expect } from 'vitest';
import { canReplyToReview } from '../PropertyReviews';

describe('canReplyToReview', () => {
  it('returns false for anonymous visitors', () => {
    expect(
      canReplyToReview({
        userId: null,
        userRoles: [],
        userAgencyId: null,
        ownerId: 10,
        propertyAgencyId: null,
      }),
    ).toBe(false);
  });

  it('returns true when the user is the property owner', () => {
    expect(
      canReplyToReview({
        userId: 10,
        userRoles: ['owner'],
        userAgencyId: null,
        ownerId: 10,
        propertyAgencyId: null,
      }),
    ).toBe(true);
  });

  it('returns true for an agent of the listing agency', () => {
    expect(
      canReplyToReview({
        userId: 42,
        userRoles: ['agent'],
        userAgencyId: 7,
        ownerId: 99,
        propertyAgencyId: 7,
      }),
    ).toBe(true);
  });

  it('returns false for an agent of a different agency', () => {
    expect(
      canReplyToReview({
        userId: 42,
        userRoles: ['agent'],
        userAgencyId: 7,
        ownerId: 99,
        propertyAgencyId: 8,
      }),
    ).toBe(false);
  });

  it('returns true for super_admin regardless of ownership', () => {
    expect(
      canReplyToReview({
        userId: 1,
        userRoles: ['super_admin'],
        userAgencyId: null,
        ownerId: 99,
        propertyAgencyId: 42,
      }),
    ).toBe(true);
  });

  it('returns false for an authenticated customer that is not involved', () => {
    expect(
      canReplyToReview({
        userId: 500,
        userRoles: ['customer'],
        userAgencyId: null,
        ownerId: 99,
        propertyAgencyId: 42,
      }),
    ).toBe(false);
  });
});
