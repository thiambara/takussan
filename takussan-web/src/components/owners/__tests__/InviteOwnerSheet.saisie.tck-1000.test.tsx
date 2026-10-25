import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { inviteOwner } from '@/lib/queries/owners';
import { withIntl } from '@/test/intl';
import { InviteOwnerSheet } from '../InviteOwnerSheet';

/**
 * TCK-1000 (P15.06, Q2) — l'invitation rendue par l'API ne porte pas de nom : la feuille passe à
 * `onInvited`, en second argument, ce qui a été saisi. Le choix du bailleur de l'assistant en tire
 * « Invitation envoyée à <nom> ».
 */
vi.mock('@/lib/queries/owners', async (original) => ({
  ...(await original<typeof import('@/lib/queries/owners')>()),
  inviteOwner: vi.fn(),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

describe('<InviteOwnerSheet> — ce que reçoit `onInvited` (TCK-1000)', () => {
  it('l’invitation créée, puis la saisie', async () => {
    const invitation = { id: 77, email: 'awa@exemple.sn', invitable_id: 604 };
    vi.mocked(inviteOwner).mockResolvedValue({ data: invitation } as never);
    const onInvited = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(withIntl(
      <QueryClientProvider client={client}>
        <InviteOwnerSheet open onOpenChange={vi.fn()} agencyId={7} onInvited={onInvited} />
      </QueryClientProvider>,
    ));
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Email'), 'awa@exemple.sn');
    await user.type(screen.getByLabelText('Prénom'), 'Awa');
    await user.type(screen.getByLabelText('Nom'), 'Ndiaye');
    await user.click(screen.getByRole('button', { name: "Envoyer l'invitation" }));

    await waitFor(() => expect(onInvited).toHaveBeenCalledTimes(1));
    expect(onInvited).toHaveBeenCalledWith(
      invitation,
      expect.objectContaining({ email: 'awa@exemple.sn', first_name: 'Awa', last_name: 'Ndiaye' }),
    );
  });
});
