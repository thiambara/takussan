import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { useCan } from '@/hooks/useCan';
import { InviteMemberDialog } from '../InviteMemberDialog';

/**
 * TCK-2205 (P227.03) — rattacher un compte comme administrateur exige `team.assign_role` côté API,
 * comme changer le rôle d'un membre (TCK-1498). Le dialogue ne propose donc « Administrateur »
 * qu'à qui la porte ; « Agent » reste proposé à tous.
 */
vi.mock('@/lib/queries/agency-members', () => ({ addAgencyMember: vi.fn() }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));
vi.mock('@/hooks/useCan', () => ({ useCan: vi.fn() }));

async function ouvrirLesRoles() {
  render(withIntl(<InviteMemberDialog agencyId={7} open onOpenChange={vi.fn()} />));
  await userEvent.setup().click(screen.getByLabelText('Rôle'));
}

describe('<InviteMemberDialog> — le rôle administrateur suit team.assign_role', () => {
  beforeEach(() => {
    vi.mocked(useCan).mockReset();
  });

  it('sans team.assign_role, seul « Agent » est proposé', async () => {
    vi.mocked(useCan).mockReturnValue({ can: false, isLoading: false });
    await ouvrirLesRoles();

    expect(await screen.findByRole('option', { name: 'Agent' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Administrateur' })).not.toBeInTheDocument();
    expect(useCan).toHaveBeenCalledWith('team.assign_role', 7, true);
  });

  it('avec team.assign_role, « Administrateur » est proposé', async () => {
    vi.mocked(useCan).mockReturnValue({ can: true, isLoading: false });
    await ouvrirLesRoles();

    expect(await screen.findByRole('option', { name: 'Administrateur' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Agent' })).toBeInTheDocument();
  });
});
