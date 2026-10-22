import { describe, expect, it } from 'vitest';

import { buildNavItems } from '@/components/layout/AppSidebar';
import type { User, UserRole } from '@/types/user';

/**
 * TCK-587 (ADR-0031 §3) — le bailleur hors personnel PROPOSE un bien à son agence ; il ne le
 * publie pas. Même route (`/app/properties/new`), autre promesse : le serveur impose brouillon +
 * privé et prévient les admins. L'hôte d'une agence individuelle en est l'administrateur et garde
 * « Publier un bien ».
 */
function utilisateur(roles: UserRole[]): User {
  return { id: 1, roles } as unknown as User;
}

function entreeDeCreation(roles: UserRole[], capacites: readonly string[] | null = ['properties.create']) {
  return buildNavItems(utilisateur(roles), capacites).find((i) => i.href === '/app/properties/new');
}

describe('AppSidebar — proposer plutôt que publier (TCK-587)', () => {
  it('le bailleur seul reçoit « Proposer un bien à mon agence »', () => {
    expect(entreeDeCreation(['owner', 'customer'])?.labelKey).toBe('proposeProperty');
  });

  it.each([
    [['agent', 'customer']],
    [['agency_admin', 'customer']],
    [['owner', 'agent', 'customer']],
  ] as UserRole[][][])('le personnel %j garde « Publier un bien »', (roles) => {
    expect(entreeDeCreation(roles)?.labelKey).toBe('publishProperty');
  });

  it('un client sans profil n’a aucune entrée de création', () => {
    expect(entreeDeCreation(['customer'])).toBeUndefined();
  });

  // P152.03 — le personnel se juge par `properties.create`, comme `PropertyPolicy::create`.
  it('un agent sans properties.create n’a aucune entrée de création', () => {
    expect(entreeDeCreation(['agent', 'customer'], ['team.invite'])).toBeUndefined();
  });

  it('un agent aussi bailleur, sans properties.create, « Propose », comme createsProposal', () => {
    expect(entreeDeCreation(['owner', 'agent', 'customer'], ['crm.view_all'])?.labelKey).toBe('proposeProperty');
  });

  it('tant que les capacités ne sont pas lues, le personnel n’a aucune entrée', () => {
    expect(entreeDeCreation(['agent', 'customer'], null)).toBeUndefined();
    expect(entreeDeCreation(['owner', 'agent', 'customer'], null)).toBeUndefined();
  });

  it('le bailleur hors personnel propose sans lecture des capacités', () => {
    expect(entreeDeCreation(['owner', 'customer'], null)?.labelKey).toBe('proposeProperty');
  });

  it('le super-admin publie sans lecture des capacités', () => {
    expect(entreeDeCreation(['super_admin', 'customer'], [])?.labelKey).toBe('publishProperty');
  });
});
