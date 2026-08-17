import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { MemberAgencyRoleSelect } from '../MemberAgencyRoleSelect';
import { useAgencyRoles, useAssignAgencyRole } from '@/lib/queries/agency-roles';
import { ApiError } from '@/lib/api';
import type { AgencyRole, AgencyRoleAssignment } from '@/types/agency-role';

vi.mock('@/lib/queries/agency-roles', () => ({
  useAgencyRoles: vi.fn(),
  useAssignAgencyRole: vi.fn(),
}));

function role(over: Partial<AgencyRole> & Pick<AgencyRole, 'id' | 'name'>): AgencyRole {
  return {
    agency_id: 1,
    base_profile_type: 'agent',
    description: null,
    is_system: false,
    is_clonable: true,
    capabilities: [],
    profiles_count: 0,
    ...over,
  };
}

const ROLES: AgencyRole[] = [
  role({ id: 1, name: 'Agent', is_system: true }),
  role({ id: 2, name: 'Agent senior' }),
  role({ id: 3, name: 'Administrateur', base_profile_type: 'agency_admin', is_system: true }),
  role({ id: 4, name: 'Propriétaire', base_profile_type: 'owner', is_system: true }),
];

const ASSIGNMENT: AgencyRoleAssignment = {
  profile_id: 42,
  profile_type: 'agent',
  user_id: 12,
  agency_role_id: 1,
  agency_role_name: 'Agent',
};

let assignMutate: ReturnType<typeof vi.fn>;

function mockHooks(error: ApiError | null = null) {
  vi.mocked(useAgencyRoles).mockReturnValue({
    data: { data: ROLES, meta: { total: 4, per_page: 100, current_page: 1, last_page: 1 } },
    isLoading: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useAgencyRoles>);

  assignMutate = vi.fn(
    (_vars: unknown, opts?: { onError?: (e: ApiError) => void }) => {
      if (error) opts?.onError?.(error);
    },
  );
  vi.mocked(useAssignAgencyRole).mockReturnValue({
    mutate: assignMutate,
    isPending: false,
    error,
  } as unknown as ReturnType<typeof useAssignAgencyRole>);
}

describe('<MemberAgencyRoleSelect>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHooks();
  });

  it('ne propose que les rôles du même base_profile_type', () => {
    render(withIntl(<MemberAgencyRoleSelect agencyId={1} assignment={ASSIGNMENT} />));

    const options = Array.from(
      screen.getByLabelText('Rôle du profil agent').querySelectorAll('option'),
    ).map((o) => o.textContent);

    // `AgencyRoleService::assign` rend 422 sur un type différent : proposer
    // « Administrateur » serait offrir un geste dont on connaît l'échec.
    expect(options).toEqual(['Agent', 'Agent senior']);
  });

  it('envoie profile_type dans le CORPS avec le nouveau rôle', async () => {
    const user = userEvent.setup();
    render(withIntl(<MemberAgencyRoleSelect agencyId={1} assignment={ASSIGNMENT} />));

    await user.selectOptions(screen.getByLabelText('Rôle du profil agent'), '2');
    await user.click(screen.getByRole('button', { name: 'Attribuer' }));

    // Un id nu ne désigne pas un profil polymorphe : l'id 42 existe dans les
    // trois tables à la fois.
    await waitFor(() =>
      expect(assignMutate).toHaveBeenCalledWith(
        { profile_type: 'agent', agency_role_id: 2 },
        expect.anything(),
      ),
    );
  });

  it('ne montre « Attribuer » que si la valeur a changé', async () => {
    const user = userEvent.setup();
    render(withIntl(<MemberAgencyRoleSelect agencyId={1} assignment={ASSIGNMENT} />));

    expect(screen.queryByRole('button', { name: 'Attribuer' })).toBeNull();

    await user.selectOptions(screen.getByLabelText('Rôle du profil agent'), '2');
    expect(screen.getByRole('button', { name: 'Attribuer' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Rôle du profil agent'), '1');
    expect(screen.queryByRole('button', { name: 'Attribuer' })).toBeNull();
  });

  it('affiche le refus « dernier admin » et retombe sur la valeur d’origine', async () => {
    const message = 'Vous ne pouvez pas retirer le dernier administrateur de l’agence.';
    mockHooks(new ApiError(422, { message, errors: { agency_role_id: [message] } }));
    const user = userEvent.setup();

    render(withIntl(<MemberAgencyRoleSelect agencyId={1} assignment={ASSIGNMENT} />));

    await user.selectOptions(screen.getByLabelText('Rôle du profil agent'), '2');
    await user.click(screen.getByRole('button', { name: 'Attribuer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    // Laisser la nouvelle valeur affichée après un refus ferait croire à un
    // enregistrement.
    expect(screen.getByLabelText('Rôle du profil agent')).toHaveValue('1');
  });
});
