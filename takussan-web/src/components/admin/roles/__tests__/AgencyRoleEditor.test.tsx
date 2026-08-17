import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { AgencyRoleEditor } from '../AgencyRoleEditor';
import { useSyncRoleCapabilities, useUpdateAgencyRole } from '@/lib/queries/agency-roles';
import { useCapabilityCatalogue } from '@/lib/queries/capabilities';
import type { AgencyRole, CapabilityCatalogue } from '@/types/agency-role';

vi.mock('@/lib/queries/agency-roles', () => ({
  useUpdateAgencyRole: vi.fn(),
  useSyncRoleCapabilities: vi.fn(),
}));
vi.mock('@/lib/queries/capabilities', () => ({
  useCapabilityCatalogue: vi.fn(),
}));

const CATALOGUE: CapabilityCatalogue = {
  domains: [
    { domain: 'properties', capabilities: ['properties.create', 'properties.publish'] },
    { domain: 'team', capabilities: ['team.invite'] },
  ],
  total: 3,
  platform_reserved: [],
};

const CUSTOM_ROLE: AgencyRole = {
  id: 7,
  agency_id: 1,
  name: 'Agent senior',
  base_profile_type: 'agent',
  description: 'Les agents confirmés',
  is_system: false,
  is_clonable: true,
  capabilities: ['properties.create'],
  profiles_count: 2,
};

let updateMutate: ReturnType<typeof vi.fn>;
let syncMutate: ReturnType<typeof vi.fn>;

function mockMutations() {
  updateMutate = vi.fn().mockResolvedValue({ data: CUSTOM_ROLE });
  syncMutate = vi.fn().mockResolvedValue({ data: CUSTOM_ROLE });
  vi.mocked(useUpdateAgencyRole).mockReturnValue({
    mutateAsync: updateMutate,
    isPending: false,
    error: null,
  } as unknown as ReturnType<typeof useUpdateAgencyRole>);
  vi.mocked(useSyncRoleCapabilities).mockReturnValue({
    mutateAsync: syncMutate,
    isPending: false,
    error: null,
  } as unknown as ReturnType<typeof useSyncRoleCapabilities>);
  vi.mocked(useCapabilityCatalogue).mockReturnValue({
    data: { data: CATALOGUE },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useCapabilityCatalogue>);
}

function box(capability: string): HTMLInputElement {
  const label = screen.getByText(capability).closest('label')!;
  return within(label).getByRole('checkbox') as HTMLInputElement;
}

describe('<AgencyRoleEditor>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutations();
  });

  it("n'appelle QUE PATCH quand seule l'identité change", async () => {
    const user = userEvent.setup();
    render(withIntl(<AgencyRoleEditor agencyId={1} role={CUSTOM_ROLE} canEdit />));

    await user.clear(screen.getByLabelText('Nom du rôle'));
    await user.type(screen.getByLabelText('Nom du rôle'), 'Agent confirmé');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(updateMutate).toHaveBeenCalledWith({
        name: 'Agent confirmé',
        description: 'Les agents confirmés',
      }),
    );
    // Le sync purge le cache du rôle et réécrit le pivot pour tous les
    // profils attachés : le déclencher sur une faute de frappe ferait payer
    // à des tiers un geste qui ne les concerne pas.
    expect(syncMutate).not.toHaveBeenCalled();
  });

  it("n'appelle QUE PUT capabilities quand seules les capacités changent", async () => {
    const user = userEvent.setup();
    render(withIntl(<AgencyRoleEditor agencyId={1} role={CUSTOM_ROLE} canEdit />));

    await user.click(box('properties.publish'));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(syncMutate).toHaveBeenCalledWith({
        capabilities: ['properties.create', 'properties.publish'],
      }),
    );
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it('appelle les deux quand les deux ont changé', async () => {
    const user = userEvent.setup();
    render(withIntl(<AgencyRoleEditor agencyId={1} role={CUSTOM_ROLE} canEdit />));

    await user.clear(screen.getByLabelText('Nom du rôle'));
    await user.type(screen.getByLabelText('Nom du rôle'), 'Agent confirmé');
    await user.click(box('team.invite'));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    expect(syncMutate).toHaveBeenCalledTimes(1);
  });

  it("n'active « Enregistrer » que sur une modification réelle", async () => {
    const user = userEvent.setup();
    render(withIntl(<AgencyRoleEditor agencyId={1} role={CUSTOM_ROLE} canEdit />));

    const save = screen.getByRole('button', { name: 'Enregistrer' });
    expect(save).toBeDisabled();

    await user.click(box('team.invite'));
    expect(save).toBeEnabled();

    // Revenir à l'état d'origine par un second clic : l'ensemble est le
    // même, donc rien à enregistrer — c'est bien un ensemble qu'on compare,
    // pas une suite de gestes.
    await user.click(box('team.invite'));
    expect(save).toBeDisabled();
  });

  it('affiche un rôle système en lecture seule, sans bouton d’enregistrement', () => {
    render(
      withIntl(
        <AgencyRoleEditor
          agencyId={1}
          role={{ ...CUSTOM_ROLE, name: 'Agent', is_system: true }}
          canEdit
        />,
      ),
    );

    expect(screen.getByTestId('agency-role-system-notice')).toBeInTheDocument();
    expect(screen.getByLabelText('Nom du rôle')).toBeDisabled();
    expect(box('properties.create')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull();
  });

  it('reste en lecture seule sans roles.edit_custom, même sur un rôle personnalisé', () => {
    render(withIntl(<AgencyRoleEditor agencyId={1} role={CUSTOM_ROLE} canEdit={false} />));

    expect(screen.queryByTestId('agency-role-system-notice')).toBeNull();
    expect(screen.getByLabelText('Nom du rôle')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull();
  });

  it('annule les modifications et revient à l’état serveur', async () => {
    const user = userEvent.setup();
    render(withIntl(<AgencyRoleEditor agencyId={1} role={CUSTOM_ROLE} canEdit />));

    await user.click(box('properties.publish'));
    expect(box('properties.publish')).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Annuler les modifications' }));

    expect(box('properties.publish')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  });

  it('repart du bon rôle quand la sélection change sans démontage', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      withIntl(<AgencyRoleEditor agencyId={1} role={CUSTOM_ROLE} canEdit />),
    );

    await user.click(box('team.invite'));
    expect(box('team.invite')).toBeChecked();

    const other: AgencyRole = {
      ...CUSTOM_ROLE,
      id: 9,
      name: 'Agent junior',
      description: null,
      capabilities: ['properties.publish'],
    };
    rerender(withIntl(<AgencyRoleEditor agencyId={1} role={other} canEdit />));

    // Sans resynchronisation, l'écran porterait le brouillon du rôle
    // PRÉCÉDENT sous le nom du nouveau — et « Enregistrer » l'y écrirait.
    expect(screen.getByLabelText('Nom du rôle')).toHaveValue('Agent junior');
    expect(box('team.invite')).not.toBeChecked();
    expect(box('properties.publish')).toBeChecked();
  });
});
