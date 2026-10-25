/**
 * P210.04 (TCK-2086) — une création de rôle refusée par l'API montre déjà l'erreur lue sur la
 * mutation ; le rejet de `mutateAsync`, lui, ne doit pas sortir non rattrapé de `void submit()`,
 * et le dialogue reste ouvert.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { ApiError } from '@/lib/api';
import { CreateRoleDialog } from '../CreateRoleDialog';
import { useCreateAgencyRole } from '@/lib/queries/agency-roles';
import type { AgencyRole } from '@/types/agency-role';

vi.mock('@/lib/queries/agency-roles', () => ({
  useCreateAgencyRole: vi.fn(),
}));

const ROLES: AgencyRole[] = [
  {
    id: 1,
    agency_id: 1,
    name: 'Agent',
    base_profile_type: 'agent',
    description: null,
    is_system: true,
    is_clonable: true,
    capabilities: [],
    profiles_count: 0,
  },
];

const rejets: unknown[] = [];
const surRejet = (raison: unknown) => {
  rejets.push(raison);
};

describe('<CreateRoleDialog> — rejet rattrapé (P210.04)', () => {
  let createMutate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rejets.length = 0;
    process.on('unhandledRejection', surRejet);
    createMutate = vi.fn().mockRejectedValue(new ApiError(422, { message: 'Nom déjà pris' }));
    vi.mocked(useCreateAgencyRole).mockReturnValue({
      mutateAsync: createMutate,
      reset: vi.fn(),
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof useCreateAgencyRole>);
  });
  afterEach(() => {
    process.off('unhandledRejection', surRejet);
  });

  it('un refus de l’API n’échappe pas au gestionnaire, et le dialogue reste ouvert', async () => {
    const onOpenChange = vi.fn();
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(
      withIntl(
        <CreateRoleDialog
          agencyId={1}
          open
          onOpenChange={onOpenChange}
          roles={ROLES}
          cloneFrom={null}
          onCreated={onCreated}
        />,
      ),
    );

    await user.type(screen.getByLabelText('Nom du rôle'), 'Comptable');
    await user.click(screen.getByRole('button', { name: 'Créer' }));

    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(rejets).toHaveLength(0);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
