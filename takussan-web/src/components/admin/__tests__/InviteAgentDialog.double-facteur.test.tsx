import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ApiError } from '@/lib/api';
import { inviteAgencyAgent } from '@/lib/queries/agency-invitations';
import { withIntl } from '@/test/intl';
import { InviteAgentDialog } from '../InviteAgentDialog';

/**
 * TCK-761 (P15.04) — inviter un agent exige la 2FA de l'admin (`AgentInvitationController`,
 * `ProtectedActions::AGENCY_TWO_FACTOR`). Le formulaire passe par `useApiForm`, qui ne connaît
 * pas la garde : le refus s'affichait en erreur de formulaire, sans la boîte qui le résout.
 */
vi.mock('@/lib/queries/agency-invitations', () => ({ inviteAgencyAgent: vi.fn() }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton-de-test' }) }));

const refus = () => new ApiError(403, { code: 'two_factor_required', message: 'Second facteur requis.' });

async function remplirEtEnvoyer() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/Prénom/i), 'Awa');
  await user.type(screen.getByLabelText(/^Nom$/i), 'Ndiaye');
  await user.type(screen.getByLabelText(/^Email$/i), 'awa@exemple.sn');
  await user.click(screen.getByRole('button', { name: /^Envoyer/i }));
}

describe('<InviteAgentDialog> — second facteur', () => {
  beforeEach(() => vi.clearAllMocks());

  it('un refus de second facteur ouvre la garde, puis l’invitation est rejouée', async () => {
    vi.mocked(inviteAgencyAgent).mockRejectedValueOnce(refus()).mockResolvedValueOnce({ data: {} } as never);
    const garde = vi.fn().mockResolvedValue(true);
    const onSuccess = vi.fn();
    render(
      withIntl(
        <ContexteGardeDoubleFacteur.Provider value={garde}>
          <InviteAgentDialog agencyId={7} open onOpenChange={vi.fn()} onSuccess={onSuccess} />
        </ContexteGardeDoubleFacteur.Provider>,
      ),
    );

    await remplirEtEnvoyer();

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(garde).toHaveBeenCalledWith('two_factor_required');
    expect(inviteAgencyAgent).toHaveBeenCalledTimes(2);
  });

  it('garde abandonnée : l’invitation n’est pas rejouée, et le dialogue reste ouvert', async () => {
    vi.mocked(inviteAgencyAgent).mockRejectedValue(refus());
    const garde = vi.fn().mockResolvedValue(false);
    const onSuccess = vi.fn();
    render(
      withIntl(
        <ContexteGardeDoubleFacteur.Provider value={garde}>
          <InviteAgentDialog agencyId={7} open onOpenChange={vi.fn()} onSuccess={onSuccess} />
        </ContexteGardeDoubleFacteur.Provider>,
      ),
    );

    await remplirEtEnvoyer();

    await waitFor(() => expect(garde).toHaveBeenCalledTimes(1));
    expect(inviteAgencyAgent).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
