import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import fr from '@/messages/fr.json';
import { useAgencyRoles, useAssignAgencyRole, useSetAgentCommissionRate } from '@/lib/queries/agency-roles';
import { withIntl } from '@/test/intl';
import type { AdminAgencyUserRow } from '@/types/admin-users';
import type { AgencyRole, AgencyRoleAssignment } from '@/types/agency-role';

import { FicheDuMembre } from '../FicheDuMembre';

/**
 * TCK-2667 — la carte « Rôle et commission » de la fiche, en rangées (maquette `app-equipe`, a,
 * « Fiche ») : « Rôle dans l'agence » et son sélecteur compact, « Taux de commission » et son
 * bouton « 40 % ✎ », puis « Profil dans l'agence » (le geste du tiroir d'avant). Rien ne part sans
 * le bouton ; sans `team.assign_role`, les deux premières se lisent sans se changer.
 */
const F = fr.admin.team.equipe.fiche;
const AGENCE = 12;

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, token: null, isLoading: false }) }));
vi.mock('@/lib/queries/admin-users', () => ({ putUserRole: vi.fn() }));
vi.mock('@/lib/queries/agency-roles', () => ({
  useAgencyRoles: vi.fn(),
  useAssignAgencyRole: vi.fn(),
  useSetAgentCommissionRate: vi.fn(),
}));

const ROLES: AgencyRole[] = [
  { id: 1, agency_id: AGENCE, name: 'Agent', base_profile_type: 'agent', description: null, is_system: true, is_clonable: true },
  {
    id: 7,
    agency_id: AGENCE,
    name: 'Agent senior',
    base_profile_type: 'agent',
    description: 'Peut aussi encaisser',
    is_system: false,
    is_clonable: true,
  },
];
const AFFECTATION: AgencyRoleAssignment = {
  profile_id: 30,
  profile_type: 'agent',
  user_id: 3,
  agency_role_id: 7,
  agency_role_name: 'Agent senior',
  commission_rate: 40,
};

const assign = vi.fn();
const setRate = vi.fn();

const MEMBRE: AdminAgencyUserRow = {
  id: 3,
  first_name: 'Awa',
  last_name: 'Test',
  email: null,
  phone: null,
  status: 'active',
  last_login_at: null,
  created_at: '2026-10-01T00:00:00Z',
  agent_profiles: [{ agency_id: AGENCE, status: 'active' }],
};

function monter(peutAttribuerLeRole: boolean, affectations: AgencyRoleAssignment[] = [AFFECTATION]) {
  return render(
    withIntl(
      <QueryClientProvider client={new QueryClient()}>
        <FicheDuMembre
          membre={MEMBRE}
          agencyId={AGENCE}
          currentUserId={1}
          affectations={affectations}
          peutAttribuerLeRole={peutAttribuerLeRole}
          peutLireLePortefeuille={false}
          suspension={null}
          onSuspension={vi.fn()}
          peutDeleguer={false}
          onCouvrir={vi.fn()}
        />
      </QueryClientProvider>,
    ),
  );
}

beforeEach(() => {
  assign.mockReset();
  setRate.mockReset();
  vi.mocked(useAgencyRoles).mockReturnValue({ data: { data: ROLES }, isLoading: false } as unknown as ReturnType<typeof useAgencyRoles>);
  vi.mocked(useAssignAgencyRole).mockReturnValue({ mutate: assign, isPending: false, error: null } as unknown as ReturnType<
    typeof useAssignAgencyRole
  >);
  vi.mocked(useSetAgentCommissionRate).mockReturnValue({ mutate: setRate, isPending: false, error: null } as unknown as ReturnType<
    typeof useSetAgentCommissionRate
  >);
});

describe('Rôle et commission, en rangées', () => {
  it('le rôle dans l’agence : sélecteur compact, sa description, et « Attribuer » seulement une fois changé', async () => {
    const user = userEvent.setup();
    monter(true);
    const selecteur = screen.getByRole('combobox', { name: F.roleDansLAgence });
    expect(selecteur).toHaveTextContent('Agent senior');
    expect(screen.getByText('Peut aussi encaisser')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: fr.admin.roles.assign.submit })).toBeNull();

    await user.click(selecteur);
    await user.click(await screen.findByRole('option', { name: 'Agent immobilier' }));
    expect(assign).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: fr.admin.roles.assign.submit }));
    expect(assign).toHaveBeenCalledWith({ profile_type: 'agent', agency_role_id: 1 }, expect.anything());
  });

  it('le taux : « 40 % » dans un bouton nommé, qui ouvre le champ ; « Annuler » le referme sans rien envoyer', async () => {
    const user = userEvent.setup();
    monter(true);
    const bouton = screen.getByRole('button', { name: F.modifierLeTaux.replace('{valeur}', '40 %') });
    expect(bouton).toHaveTextContent('40 %');
    await user.click(bouton);
    const champ = screen.getByRole('spinbutton', { name: F.tauxDeCommission });
    expect(champ).toHaveFocus();
    await user.clear(champ);
    await user.type(champ, '35');
    await user.click(screen.getByRole('button', { name: fr.common.actions.cancel }));
    expect(setRate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: F.modifierLeTaux.replace('{valeur}', '40 %') })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: F.modifierLeTaux.replace('{valeur}', '40 %') }));
    await user.clear(screen.getByRole('spinbutton', { name: F.tauxDeCommission }));
    await user.type(screen.getByRole('spinbutton', { name: F.tauxDeCommission }), '35');
    await user.click(screen.getByRole('button', { name: fr.admin.roles.commissionRate.submit }));
    expect(setRate).toHaveBeenCalledWith({ commission_rate: 35 }, expect.anything());
  });

  it('sans `team.assign_role`, le rôle et le taux se lisent, sans contrôle', () => {
    monter(false);
    expect(screen.queryByRole('combobox', { name: F.roleDansLAgence })).toBeNull();
    expect(screen.queryByRole('button', { name: /Modifier le taux/ })).toBeNull();
    expect(screen.getByText('Agent senior')).toBeInTheDocument();
    expect(screen.getByText('40 %')).toBeInTheDocument();
  });

  it('« Profil dans l’agence » s’ouvre sur le profil en place, même sans `roles` sur la ligne', () => {
    monter(true);
    const carte = screen.getByRole('heading', { name: F.roleEtCommission }).closest('section') as HTMLElement;
    const profil = within(carte).getByRole('combobox', { name: F.typeDeProfil });
    expect(profil).toHaveTextContent(fr.admin.users.roles.agent);
    expect(profil).not.toHaveTextContent(fr.admin.users.rolesEditor.placeholder);
  });
});
