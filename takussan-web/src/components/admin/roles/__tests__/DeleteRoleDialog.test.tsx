import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { DeleteRoleDialog } from '../DeleteRoleDialog';
import { useDeleteAgencyRole } from '@/lib/queries/agency-roles';
import { ApiError } from '@/lib/api';
import type { AgencyRole } from '@/types/agency-role';

vi.mock('@/lib/queries/agency-roles', () => ({
  useDeleteAgencyRole: vi.fn(),
}));

const ROLE: AgencyRole = {
  id: 7,
  agency_id: 1,
  name: 'Agent senior',
  base_profile_type: 'agent',
  description: null,
  is_system: false,
  is_clonable: true,
  capabilities: [],
  profiles_count: 2,
};

/**
 * `useApiMutation` expose `mutate(vars, {onSuccess, onError})`. Ce faux le
 * reproduit à l'identique : c'est par ce chemin-là que le 409 arrive.
 */
function mockDelete(behaviour: (id: number) => { ok: true } | { error: ApiError }) {
  const reset = vi.fn();
  const mutate = vi.fn(
    (
      id: number,
      opts?: { onSuccess?: (d: unknown) => void; onError?: (e: ApiError) => void },
    ) => {
      const result = behaviour(id);
      if ('ok' in result) opts?.onSuccess?.({ message: 'ok' });
      else opts?.onError?.(result.error);
    },
  );
  vi.mocked(useDeleteAgencyRole).mockReturnValue({
    mutate,
    reset,
    isPending: false,
    error: null,
  } as unknown as ReturnType<typeof useDeleteAgencyRole>);
  return { mutate, reset };
}

describe('<DeleteRoleDialog>', () => {
  beforeEach(() => vi.clearAllMocks());

  it('supprime et remonte le rôle supprimé', async () => {
    mockDelete(() => ({ ok: true }));
    const onDeleted = vi.fn();
    const user = userEvent.setup();

    render(
      withIntl(
        <DeleteRoleDialog agencyId={1} role={ROLE} onCancel={vi.fn()} onDeleted={onDeleted} />,
      ),
    );

    expect(screen.getByText(/Le rôle « Agent senior » sera supprimé/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Supprimer' }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(ROLE));
  });

  it('transforme le 409 en liste nominative des profils en cause', async () => {
    mockDelete(() => ({
      error: new ApiError(409, {
        message: 'Ce rôle est encore attribué',
        profiles: [
          { id: 3, type: 'agent', user_id: 12, display_name: 'Awa Diop' },
          { id: 4, type: 'agent', user_id: 13, display_name: null },
        ],
      }),
    }));
    const onDeleted = vi.fn();
    const user = userEvent.setup();

    render(
      withIntl(
        <DeleteRoleDialog agencyId={1} role={ROLE} onCancel={vi.fn()} onDeleted={onDeleted} />,
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Supprimer' }));

    // Le 409 est une RÉPONSE prévue par la spec (AC5), pas une panne : un
    // bandeau rouge générique perdrait la seule information utile — qui.
    const conflict = await screen.findByTestId('delete-role-conflict');
    expect(within(conflict).getByText('Awa Diop')).toBeInTheDocument();
    expect(within(conflict).getByText('Profil #4')).toBeInTheDocument();
    expect(screen.getByText('Ce rôle est encore attribué')).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
    // Réessayer ne servirait à rien tant que les profils sont attachés.
    expect(screen.queryByRole('button', { name: 'Supprimer' })).toBeNull();
  });

  it('affiche une erreur ordinaire sans la déguiser en conflit', async () => {
    mockDelete(() => ({ error: new ApiError(500, { message: 'Panne serveur' }) }));
    const user = userEvent.setup();

    render(
      withIntl(
        <DeleteRoleDialog agencyId={1} role={ROLE} onCancel={vi.fn()} onDeleted={vi.fn()} />,
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Supprimer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Panne serveur');
    expect(screen.queryByTestId('delete-role-conflict')).toBeNull();
  });

  it('repart d’un état vierge quand on rouvre sur un autre rôle', async () => {
    mockDelete((id) =>
      id === 7
        ? {
            error: new ApiError(409, {
              message: 'conflit',
              profiles: [{ id: 3, type: 'agent', user_id: 12, display_name: 'Awa Diop' }],
            }),
          }
        : { ok: true },
    );
    const user = userEvent.setup();

    const { rerender } = render(
      withIntl(
        <DeleteRoleDialog agencyId={1} role={ROLE} onCancel={vi.fn()} onDeleted={vi.fn()} />,
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    await screen.findByTestId('delete-role-conflict');

    rerender(
      withIntl(
        <DeleteRoleDialog
          agencyId={1}
          role={{ ...ROLE, id: 9, name: 'Agent junior' }}
          onCancel={vi.fn()}
          onDeleted={vi.fn()}
        />,
      ),
    );

    // Sans réinitialisation, la liste de conflit du rôle PRÉCÉDENT resterait
    // sous le titre du nouveau.
    expect(screen.queryByTestId('delete-role-conflict')).toBeNull();
    expect(screen.getByText(/Le rôle « Agent junior » sera supprimé/)).toBeInTheDocument();
  });
});
