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

describe('decidePublishIntent — TCK-625', () => {
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

  it('sans espace où publier : l’assistant hôte', () => {
    const decision = decidePublishIntent(makeUser(), [], false);
    expect(decision.status).toBe('host-needed');
    expect(decision.target).toBe(PUBLISH_TARGETS.hostWizard);
  });

  it('un prestataire n’a pas d’espace où publier', () => {
    const decision = decidePublishIntent(
      makeUser({ roles: ['service_provider'] }),
      [makeProfile({ id: 'service_provider:3', type: 'service_provider', agency_id: 9 })],
      false,
    );
    expect(decision.status).toBe('host-needed');
  });

  it('un seul espace, déjà actif : le formulaire, sans bascule', () => {
    const profil = makeProfile({ id: 'agent:1', type: 'agent', agency_id: 42 });
    const decision = decidePublishIntent(makeUser(), [profil], false, 'agent:1');
    expect(decision.status).toBe('single-space');
    expect(decision.target).toBe(PUBLISH_TARGETS.newProperty);
    expect(decision.profilABasculer).toBeNull();
  });

  it('un seul espace, profil actif ailleurs : bascule d’abord', () => {
    const decision = decidePublishIntent(
      makeUser(),
      [
        makeProfile({ id: 'owner:5', type: 'owner', agency_id: 42 }),
        makeProfile({ id: 'service_provider:3', type: 'service_provider', agency_id: 9 }),
      ],
      false,
      'service_provider:3',
    );
    expect(decision.status).toBe('single-space');
    expect(decision.profilABasculer).toBe('owner:5');
  });

  it('le propriétaire compte : un hôte (admin + propriétaire de son espace) a UN espace, sous son profil admin', () => {
    const decision = decidePublishIntent(
      makeUser(),
      [
        makeProfile({ id: 'owner:8', type: 'owner', agency_id: 7 }),
        makeProfile({ id: 'agency_admin:2', type: 'agency_admin', agency_id: 7 }),
      ],
      false,
    );
    expect(decision.espaces).toHaveLength(1);
    expect(decision.espaces[0]!.profile.id).toBe('agency_admin:2');
    expect(decision.profilABasculer).toBe('agency_admin:2');
  });

  it('plusieurs espaces : le choix, sur place — plus de détour par un /app qui ne lit rien', () => {
    const decision = decidePublishIntent(
      makeUser(),
      [
        makeProfile({ id: 'agent:1', type: 'agent', agency_id: 1 }),
        makeProfile({ id: 'owner:2', type: 'owner', agency_id: 2 }),
      ],
      false,
    );
    expect(decision.status).toBe('choose-space');
    expect(decision.target).toBeNull();
    expect(decision.espaces.map((e) => e.agencyId).sort()).toEqual([1, 2]);
  });
});
