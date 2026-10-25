import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { UserDetailDrawer } from '../UserDetailDrawer';
import type { AdminAgencyUserRow } from '@/types/admin-users';
import type { AgencyRoleAssignment } from '@/types/agency-role';

vi.mock('../UserRolesEditor', () => ({ UserRolesEditor: () => null }));
vi.mock('@/components/admin/roles/MemberAgencyRoleSelect', () => ({
  MemberAgencyRoleSelect: () => null,
}));
vi.mock('@/components/admin/roles/AgentCommissionRateField', () => ({
  AgentCommissionRateField: ({ assignment }: { assignment: AgencyRoleAssignment }) => (
    <p data-testid="taux">{assignment.profile_id}</p>
  ),
}));

const MEMBRE = {
  id: 12,
  first_name: 'Awa',
  last_name: 'Diop',
  email: 'awa@example.test',
  phone: null,
  status: 'active',
  roles: [],
  last_login_at: null,
  created_at: null,
} as unknown as AdminAgencyUserRow;

function affectation(profile_type: AgencyRoleAssignment['profile_type'], profile_id: number): AgencyRoleAssignment {
  return { profile_id, profile_type, user_id: 12, agency_role_id: 1, agency_role_name: null, commission_rate: null };
}

function rendre(assignments: AgencyRoleAssignment[], canAssignRole = true) {
  render(
    withIntl(
      <UserDetailDrawer
        user={MEMBRE}
        currentUserId={1}
        onOpenChange={() => {}}
        agencyId={3}
        assignments={assignments}
        canAssignRole={canAssignRole}
      />,
    ),
  );
}

/** TCK-2364 (P241.02) — le taux d'un agent se pose sur sa fiche de membre, sous `team.assign_role`. */
describe('<UserDetailDrawer> — taux de commission', () => {
  it("propose le taux sur le profil d'agent, et seulement sur lui", () => {
    rendre([affectation('agent', 42), affectation('owner', 43)]);

    expect(screen.getAllByTestId('taux').map((n) => n.textContent)).toEqual(['42']);
  });

  it('ne le propose pas sans `team.assign_role`', () => {
    rendre([affectation('agent', 42)], false);

    expect(screen.queryByTestId('taux')).toBeNull();
  });
});
