import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { AdminUsersTable } from '../AdminUsersTable';
import type { AdminAgencyUserRow } from '@/types/admin-users';
import type { AgencyRoleAssignment } from '@/types/agency-role';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const ROWS: AdminAgencyUserRow[] = [
  {
    id: 12,
    first_name: 'Awa',
    last_name: 'Diop',
    email: 'awa@example.test',
    phone: null,
    status: 'active',
    last_login_at: null,
    created_at: '2026-01-01T00:00:00+00:00',
    roles: ['agent'],
  },
];

function renderTable(
  assignmentsByUser?: ReadonlyMap<number, readonly AgencyRoleAssignment[]>,
) {
  render(
    withIntl(
      <AdminUsersTable
        rows={ROWS}
        total={1}
        currentUserId={99}
        assignmentsByUser={assignmentsByUser}
        onSelect={vi.fn()}
        onQuickAction={vi.fn()}
      />,
    ),
  );
  return screen.getByTestId('admin-user-row-12');
}

describe('colonne « Rôle » de la console Équipe (TCK-279)', () => {
  it("affiche le NOM de l'AgencyRole quand la carte est arrivée", () => {
    const row = renderTable(
      new Map([
        [
          12,
          [
            {
              profile_id: 42,
              profile_type: 'agent',
              user_id: 12,
              agency_role_id: 2,
              agency_role_name: 'Agent senior',
            },
          ],
        ],
      ]),
    );

    // C'est la distinction que la colonne existe pour montrer depuis
    // TCK-279 : deux agents de la même agence peuvent porter « Agent » et
    // « Agent senior ».
    expect(within(row).getByText('Agent senior')).toBeInTheDocument();
    expect(within(row).queryByText('Agent')).toBeNull();
  });

  it('replie sur le TYPE de profil tant que la carte n’est pas arrivée', () => {
    const row = renderTable(undefined);

    // Afficher « — » pendant que la seconde requête voyage remplacerait une
    // donnée juste par un vide qui se lit comme une absence de rôle.
    expect(within(row).getByText('Agent')).toBeInTheDocument();
  });

  it('affiche un badge par profil quand un membre en a deux dans l’agence', () => {
    const row = renderTable(
      new Map([
        [
          12,
          [
            {
              profile_id: 42,
              profile_type: 'agent',
              user_id: 12,
              agency_role_id: 2,
              agency_role_name: 'Agent senior',
            },
            {
              profile_id: 8,
              profile_type: 'owner',
              user_id: 12,
              agency_role_id: 4,
              agency_role_name: 'Propriétaire',
            },
          ],
        ],
      ]),
    );

    expect(within(row).getByText('Agent senior')).toBeInTheDocument();
    expect(within(row).getByText('Propriétaire')).toBeInTheDocument();
  });
});
