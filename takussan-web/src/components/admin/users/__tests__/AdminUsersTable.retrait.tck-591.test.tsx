/**
 * TCK-591 AC23 (front) — « Retirer de l'agence » n'est proposé que pour le personnel : un bailleur
 * seul n'est pas « retiré de l'équipe » (l'API le refuse en `member_not_staff`).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { AdminUsersTable } from '../AdminUsersTable';
import type { AdminAgencyUserRow } from '@/types/admin-users';
import type { AgencyRoleAssignment, AssignableBaseType } from '@/types/agency-role';
import type { UserRole } from '@/types/user';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const ligne = (id: number, roles: UserRole[]): AdminAgencyUserRow => ({
  id,
  first_name: 'Awa',
  last_name: `N${id}`,
  email: `m${id}@example.test`,
  phone: null,
  status: 'active',
  last_login_at: null,
  created_at: '2026-01-01T00:00:00+00:00',
  roles,
});

const profil = (user_id: number, profile_type: AssignableBaseType): AgencyRoleAssignment => ({
  profile_id: user_id * 10,
  profile_type,
  user_id,
  agency_role_id: 1,
  agency_role_name: null,
});

async function actions(row: AdminAgencyUserRow, assignments?: AgencyRoleAssignment[]) {
  const onRemove = vi.fn();
  render(withIntl(
    <AdminUsersTable
      rows={[row]}
      total={1}
      currentUserId={99}
      assignmentsByUser={assignments ? new Map([[row.id, assignments]]) : undefined}
      onSelect={vi.fn()}
      onQuickAction={vi.fn()}
      onRemove={onRemove}
    />,
  ));
  await userEvent.click(screen.getByRole('button', { name: /Actions pour Awa/ }));
  return onRemove;
}

describe("« Retirer de l'agence » réservé au personnel (TCK-591 AC23)", () => {
  it('un bailleur seul ne se voit pas proposer le retrait', async () => {
    await actions(ligne(12, ['owner']), [profil(12, 'owner')]);
    expect(await screen.findByText('Voir le détail')).toBeInTheDocument();
    expect(screen.queryByText("Retirer de l'agence")).toBeNull();
  });

  it('un admin d’agence sans profil agent, lui, peut être retiré', async () => {
    const onRemove = await actions(ligne(13, ['owner', 'agency_admin']), [profil(13, 'owner'), profil(13, 'agency_admin')]);
    await userEvent.click(await screen.findByText("Retirer de l'agence"));
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 13 }));
  });

  it('tant que les profils ne sont pas arrivés, le type porté par la ligne décide', async () => {
    await actions(ligne(14, ['owner']));
    expect(await screen.findByText('Voir le détail')).toBeInTheDocument();
    expect(screen.queryByText("Retirer de l'agence")).toBeNull();
  });
});
