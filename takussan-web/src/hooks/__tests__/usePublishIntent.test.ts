import { describe, it, expect } from 'vitest';

import {
  decidePublishIntent,
  PUBLISH_TARGETS,
} from '@/hooks/usePublishIntent';
import type { Profile } from '@/types/profile';
import type { User } from '@/types/user';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    first_name: 'Aïssatou',
    last_name: 'Diop',
    full_name: 'Aïssatou Diop',
    email: 'a@example.com',
    phone: null,
    bio: null,
    avatar_url: null,
    email_verified_at: null,
    phone_verified_at: null,
    two_factor_enabled: false,
    agency_id: null,
    roles: ['customer'],
    status: 'active',
    created_at: '2026-05-10T00:00:00Z',
    ...overrides,
  };
}

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p_1',
    type: 'agent',
    numeric_id: 1,
    agency_id: 1,
    status: 'active',
    created_at: '2026-05-10T00:00:00Z',
    ...overrides,
  };
}

describe('decidePublishIntent', () => {
  it('returns loading status while data is unresolved', () => {
    const decision = decidePublishIntent(null, undefined, true);
    expect(decision.status).toBe('loading');
    expect(decision.target).toBeNull();
  });

  it('routes anonymous visitors to login with the publish redirect', () => {
    const decision = decidePublishIntent(null, undefined, false);
    expect(decision.status).toBe('anonymous');
    expect(decision.target).toBe(PUBLISH_TARGETS.login);
  });

  it('routes a customer with no agency profile to the host wizard stub', () => {
    const decision = decidePublishIntent(makeUser(), [], false);
    expect(decision.status).toBe('host-needed');
    expect(decision.target).toBe(PUBLISH_TARGETS.hostWizard);
    expect(decision.agencyIds).toEqual([]);
  });

  it('routes a single-agency user straight to /app/properties/new', () => {
    const decision = decidePublishIntent(
      makeUser({ roles: ['customer', 'agent'] }),
      [makeProfile({ agency_id: 42 })],
      false,
    );
    expect(decision.status).toBe('single-agency');
    expect(decision.target).toBe(PUBLISH_TARGETS.newProperty);
    expect(decision.resolvedAgencyId).toBe(42);
  });

  it('treats an agency_admin user with agency_id as having one agency', () => {
    const decision = decidePublishIntent(
      makeUser({ roles: ['agency_admin'], agency_id: 7 }),
      [],
      false,
    );
    expect(decision.status).toBe('single-agency');
    expect(decision.resolvedAgencyId).toBe(7);
    expect(decision.target).toBe(PUBLISH_TARGETS.newProperty);
  });

  it('routes a multi-agency user to the profile picker before publishing', () => {
    const decision = decidePublishIntent(
      makeUser({ roles: ['agency_admin'], agency_id: 1 }),
      [makeProfile({ id: 'p_a', agency_id: 1 }), makeProfile({ id: 'p_b', agency_id: 2 })],
      false,
    );
    expect(decision.status).toBe('multi-agency');
    expect(decision.target).toBe(PUBLISH_TARGETS.profilePicker);
    expect(decision.agencyIds.sort()).toEqual([1, 2]);
    expect(decision.resolvedAgencyId).toBeNull();
  });

  it('ignores broker / service_provider profiles when scoring agencies', () => {
    const decision = decidePublishIntent(
      makeUser(),
      [
        makeProfile({ type: 'broker', agency_id: 99 }),
        makeProfile({ type: 'service_provider', agency_id: 100 }),
      ],
      false,
    );
    expect(decision.status).toBe('host-needed');
    expect(decision.target).toBe(PUBLISH_TARGETS.hostWizard);
  });
});
