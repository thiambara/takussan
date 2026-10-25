import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { inviteServiceProvider } from '@/lib/queries/service-providers';
import { withIntl } from '@/test/intl';
import { InviteServiceProviderSheet } from '../InviteServiceProviderSheet';

/**
 * P234.05 (TCK-2280) — un prestataire déjà inscrit garde les métiers de son profil : le toast
 * nomme ceux que l'API dit retenus (`meta.retained_trades`), pour que l'agence sache que les siens
 * ne le sont pas.
 */
vi.mock('@/lib/queries/service-providers', async (original) => ({
  ...(await original<typeof import('@/lib/queries/service-providers')>()),
  inviteServiceProvider: vi.fn(),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));
const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));

async function inviter(meta: Record<string, unknown>) {
  vi.mocked(inviteServiceProvider).mockResolvedValueOnce({ data: { id: 1 }, meta } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <InviteServiceProviderSheet open onOpenChange={vi.fn()} agencyId={7} />
    </QueryClientProvider>,
  ));
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), 'awa@exemple.sn');
  await user.type(screen.getByLabelText('Prénom'), 'Awa');
  await user.type(screen.getByLabelText('Nom'), 'Ndiaye');
  await user.click(screen.getByRole('button', { name: "Envoyer l'invitation" }));
  await waitFor(() => expect(toastAdd).toHaveBeenCalled());
  return toastAdd.mock.calls[0][0] as { description?: string };
}

describe('<InviteServiceProviderSheet> — métiers retenus', () => {
  beforeEach(() => {
    vi.mocked(inviteServiceProvider).mockReset();
    toastAdd.mockReset();
  });

  it('un prestataire déjà inscrit : le toast nomme les métiers de son profil', async () => {
    const toast = await inviter({ existing_sp_other_agency: true, retained_trades: ['plumbing', 'electrical'] });

    expect(toast.description).toContain('Plomberie, Électricité');
  });

  it('un brouillon neuf : pas de mention des métiers', async () => {
    const toast = await inviter({ existing_sp_other_agency: false, retained_trades: ['plumbing'] });

    expect(toast.description).toBeUndefined();
  });
});
