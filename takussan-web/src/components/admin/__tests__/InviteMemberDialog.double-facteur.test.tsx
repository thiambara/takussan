import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { addAgencyMember } from '@/lib/queries/agency-members';
import { withIntl } from '@/test/intl';
import { InviteMemberDialog } from '../InviteMemberDialog';

/**
 * TCK-1203 — ajouter un compte existant à l'agence exige la 2FA de l'admin
 * (`AgencyController@addAgent`). Le formulaire passe par `useApiForm`, qui ne connaît pas la
 * garde : le refus s'affichait en erreur de formulaire, sans la boîte qui le résout.
 */
vi.mock('@/lib/queries/agency-members', () => ({ addAgencyMember: vi.fn() }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: true, isLoading: false }) }));

const refus = () => new ApiError(403, { code: 'two_factor_required', message: 'Second facteur requis.' });

function monter(garde: GardeDoubleFacteurFn) {
  const onSuccess = vi.fn();
  render(withIntl(
    <ContexteGardeDoubleFacteur.Provider value={garde}>
      <InviteMemberDialog agencyId={7} open onOpenChange={vi.fn()} onSuccess={onSuccess} />
    </ContexteGardeDoubleFacteur.Provider>,
  ));
  return onSuccess;
}

async function envoyer() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), 'awa@exemple.sn');
  await user.click(screen.getByRole('button', { name: 'Ajouter' }));
}

describe('<InviteMemberDialog> — second facteur', () => {
  beforeEach(() => {
    vi.mocked(addAgencyMember).mockReset();
  });

  it('un refus de second facteur ouvre la garde, puis l’ajout est rejoué', async () => {
    vi.mocked(addAgencyMember).mockRejectedValueOnce(refus()).mockResolvedValueOnce({ data: {} } as never);
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => true);
    const onSuccess = monter(garde);

    await envoyer();

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(garde).toHaveBeenCalledWith('two_factor_required');
    expect(addAgencyMember).toHaveBeenCalledTimes(2);
    expect(addAgencyMember).toHaveBeenLastCalledWith(7, { email: 'awa@exemple.sn', role: 'agent' }, 'jeton');
  });

  it('garde abandonnée : pas de rejeu, l’erreur s’affiche et rien n’est ajouté', async () => {
    vi.mocked(addAgencyMember).mockRejectedValue(refus());
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => false);
    const onSuccess = monter(garde);

    await envoyer();

    expect(await screen.findByText('Second facteur requis.')).toBeInTheDocument();
    expect(garde).toHaveBeenCalledTimes(1);
    expect(addAgencyMember).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
