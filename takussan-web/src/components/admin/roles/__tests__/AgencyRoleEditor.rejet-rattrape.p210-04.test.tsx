/**
 * P210.04 (TCK-2086) — l'enregistrement d'un rôle refusé par l'API montre déjà l'erreur lue sur
 * la mutation ; le rejet de `mutateAsync`, lui, ne doit pas sortir non rattrapé de `void save()`.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { ApiError } from '@/lib/api';
import { AgencyRoleEditor } from '../AgencyRoleEditor';
import { useSyncRoleCapabilities, useUpdateAgencyRole } from '@/lib/queries/agency-roles';
import { useCapabilityCatalogue } from '@/lib/queries/capabilities';
import type { AgencyRole } from '@/types/agency-role';

vi.mock('@/lib/queries/agency-roles', () => ({
  useUpdateAgencyRole: vi.fn(),
  useSyncRoleCapabilities: vi.fn(),
}));
vi.mock('@/lib/queries/capabilities', () => ({
  useCapabilityCatalogue: vi.fn(),
}));

const ROLE: AgencyRole = {
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

const rejets: unknown[] = [];
const surRejet = (raison: unknown) => {
  rejets.push(raison);
};

describe('<AgencyRoleEditor> — rejet rattrapé (P210.04)', () => {
  let updateMutate: ReturnType<typeof vi.fn>;
  let syncMutate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rejets.length = 0;
    process.on('unhandledRejection', surRejet);
    updateMutate = vi.fn().mockRejectedValue(new ApiError(422, { message: 'Nom déjà pris' }));
    syncMutate = vi.fn().mockResolvedValue({ data: ROLE });
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
      data: { data: { domains: [], total: 0, platform_reserved: [] } },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCapabilityCatalogue>);
  });
  afterEach(() => {
    process.off('unhandledRejection', surRejet);
  });

  it('un refus de l’API n’échappe pas au gestionnaire, et rien n’est dit enregistré', async () => {
    const user = userEvent.setup();
    render(withIntl(<AgencyRoleEditor agencyId={1} role={ROLE} canEdit />));

    await user.clear(screen.getByLabelText('Nom du rôle'));
    await user.type(screen.getByLabelText('Nom du rôle'), 'Agent confirmé');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(rejets).toHaveLength(0);
    expect(syncMutate).not.toHaveBeenCalled();
    expect(screen.queryByText('Modifications enregistrées.')).toBeNull();
  });
});
