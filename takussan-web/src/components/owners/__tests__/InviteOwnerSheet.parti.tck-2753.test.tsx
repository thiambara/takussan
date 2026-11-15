import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { inviteOwner } from '@/lib/queries/owners';
import { withIntl } from '@/test/intl';
import { InviteOwnerSheet } from '../InviteOwnerSheet';

/**
 * TCK-2753 (AC11, ADR-0108 § 5) — un bailleur PARTI ne se réinvite pas : l'API refuse par un 409 de
 * code `owner.invite_departed`, que la fiche d'invitation dit « a quitté », et non « déjà propriétaire ».
 */
vi.mock('@/lib/queries/owners', async (original) => ({
  ...(await original<typeof import('@/lib/queries/owners')>()),
  inviteOwner: vi.fn(),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));
const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <ContexteGardeDoubleFacteur.Provider value={vi.fn<GardeDoubleFacteurFn>(async () => true)}>
        <InviteOwnerSheet open onOpenChange={vi.fn()} agencyId={7} />
      </ContexteGardeDoubleFacteur.Provider>
    </QueryClientProvider>,
  ));
}

async function inviter() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), 'awa@exemple.sn');
  await user.type(screen.getByLabelText('Prénom'), 'Awa');
  await user.type(screen.getByLabelText('Nom'), 'Ndiaye');
  await user.click(screen.getByRole('button', { name: "Envoyer l'invitation" }));
}

describe('<InviteOwnerSheet> — bailleur parti (TCK-2753)', () => {
  beforeEach(() => {
    vi.mocked(inviteOwner).mockReset();
    toastAdd.mockReset();
  });

  it('le 409 `owner.invite_departed` dit qu’il a quitté l’agence', async () => {
    vi.mocked(inviteOwner).mockRejectedValue(new ApiError(409, { code: 'owner.invite_departed', message: 'Ce propriétaire a quitté l’agence.' }));
    monter();

    await inviter();

    await waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error',
      description: 'Ce propriétaire a quitté votre agence : il ne peut pas y être invité de nouveau.',
    })));
  });

  it('témoin : un autre 409 reste « déjà propriétaire »', async () => {
    vi.mocked(inviteOwner).mockRejectedValue(new ApiError(409, { code: 'http.conflict', message: 'Conflict.' }));
    monter();

    await inviter();

    await waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error',
      description: 'Cette personne est déjà propriétaire dans votre agence.',
    })));
  });
});
