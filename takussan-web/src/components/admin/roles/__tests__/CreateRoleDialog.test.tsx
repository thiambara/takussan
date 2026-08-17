import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { CreateRoleDialog } from '../CreateRoleDialog';
import { useCreateAgencyRole } from '@/lib/queries/agency-roles';
import type { AgencyRole } from '@/types/agency-role';

vi.mock('@/lib/queries/agency-roles', () => ({
  useCreateAgencyRole: vi.fn(),
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
  role({ id: 2, name: 'Agent verrouillé', is_clonable: false }),
  role({ id: 3, name: 'Administrateur', base_profile_type: 'agency_admin', is_system: true }),
];

let createMutate: ReturnType<typeof vi.fn>;

function mockCreate() {
  createMutate = vi.fn().mockResolvedValue({ data: role({ id: 9, name: 'Agent senior' }) });
  vi.mocked(useCreateAgencyRole).mockReturnValue({
    mutateAsync: createMutate,
    reset: vi.fn(),
    isPending: false,
    error: null,
  } as unknown as ReturnType<typeof useCreateAgencyRole>);
}

function renderDialog(cloneFrom: AgencyRole | null = null) {
  const onOpenChange = vi.fn();
  const onCreated = vi.fn();
  render(
    withIntl(
      <CreateRoleDialog
        agencyId={1}
        open
        onOpenChange={onOpenChange}
        roles={ROLES}
        cloneFrom={cloneFrom}
        onCreated={onCreated}
      />,
    ),
  );
  return { onOpenChange, onCreated };
}

describe('<CreateRoleDialog>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate();
  });

  it('ne propose que les types de profil qui portent réellement un rôle', () => {
    renderDialog();

    const options = Array.from(
      screen.getByLabelText('Type de profil ciblé').querySelectorAll('option'),
    ).map((o) => o.textContent);

    // `service_provider` en est absent : la table n'a pas d'`agency_role_id`
    // (profil user-scopé, N agences — TCK-315). Un rôle qu'on ne peut
    // assigner à personne serait une promesse vide.
    expect(options).toEqual(['Agents', 'Administrateurs', 'Propriétaires']);
  });

  it('préremplit le nom par une clé traduite, pas par une chaîne en dur', () => {
    renderDialog(ROLES[0]);

    // Le suffixe est un gabarit interpolé : `check-i18n.mjs` ne sait pas
    // les voir (limite documentée), donc c'est ce test qui tient la règle.
    expect(screen.getByLabelText('Nom du rôle')).toHaveValue('Agent (copie)');
  });

  it('verrouille le type quand on arrive par « Cloner »', () => {
    renderDialog(ROLES[2]);

    const select = screen.getByLabelText('Type de profil ciblé');
    // Changer le type invaliderait la source de clonage : l'API refuse un
    // `clone_from` d'un autre `base_profile_type`.
    expect(select).toBeDisabled();
    expect(select).toHaveValue('agency_admin');
  });

  it('ne liste comme sources que les rôles clonables du même type', () => {
    renderDialog();

    const options = Array.from(
      screen.getByLabelText('Partir des capacités de').querySelectorAll('option'),
    ).map((o) => o.textContent);

    // « Administrateur » est d'un autre type ; « Agent verrouillé » porte
    // `is_clonable: false`.
    expect(options).toEqual(['Aucune capacité (partir de zéro)', 'Agent']);
  });

  it('envoie clone_from: null quand on part de zéro', async () => {
    const user = userEvent.setup();
    const { onCreated } = renderDialog();

    await user.type(screen.getByLabelText('Nom du rôle'), 'Comptable');
    await user.click(screen.getByRole('button', { name: 'Créer' }));

    await waitFor(() =>
      expect(createMutate).toHaveBeenCalledWith({
        name: 'Comptable',
        base_profile_type: 'agent',
        description: null,
        clone_from: null,
      }),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it('envoie clone_from avec l’id de la source', async () => {
    const user = userEvent.setup();
    renderDialog(ROLES[0]);

    await user.clear(screen.getByLabelText('Nom du rôle'));
    await user.type(screen.getByLabelText('Nom du rôle'), 'Agent senior');
    await user.click(screen.getByRole('button', { name: 'Créer' }));

    await waitFor(() =>
      expect(createMutate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Agent senior', clone_from: 1 }),
      ),
    );
  });

  it('refuse de soumettre un nom vide', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: 'Créer' })).toBeDisabled();
  });
});
