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

function entreeDeCreation(roles: UserRole[]) {
  return buildNavItems(utilisateur(roles)).find((i) => i.href === '/app/properties/new');
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
});
