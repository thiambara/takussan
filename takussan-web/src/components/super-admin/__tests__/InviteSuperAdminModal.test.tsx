import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/ui/toast';
import { withIntl } from '@/test/intl';
import { inviteSuperAdmin } from '@/lib/queries/super-admin';
import { InviteSuperAdminModal } from '../InviteSuperAdminModal';

vi.mock('@/lib/queries/super-admin', () => ({
  inviteSuperAdmin: vi.fn(),
}));

function renderModal(overrides: { onInvited?: () => void } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  // `withIntl` charge le VRAI `fr.json` : la modale rend ses libellés via next-intl depuis
  // TCK-292, et un provider à messages vides rendrait la CLÉ au lieu du libellé.
  return render(
    withIntl(
      <ToastProvider>
        <QueryClientProvider client={queryClient}>
          <InviteSuperAdminModal open onOpenChange={() => {}} onInvited={overrides.onInvited} />
        </QueryClientProvider>
      </ToastProvider>,
    ),
  );
}

describe('<InviteSuperAdminModal>', () => {
  it('posts the payload and fires onInvited on success', async () => {
    const onInvited = vi.fn();
    vi.mocked(inviteSuperAdmin).mockResolvedValue({
      id: 1,
      email: 'new@takussan.app',
      role: 'super_admin',
      status: 'sent',
      agency_id: null,
      invited_by: 1,
      expires_at: null,
      created_at: null,
      is_expired: false,
      metadata: null,
    });

    renderModal({ onInvited });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/email/i), 'new@takussan.app');
    await user.type(screen.getByLabelText(/prénom/i), 'Awa');
    await user.type(screen.getByLabelText(/^Nom$/i), 'Ndiaye');
    await user.click(screen.getByRole('button', { name: /envoyer l’invitation/i }));

    await waitFor(() =>
      expect(inviteSuperAdmin).toHaveBeenCalledWith({
        email: 'new@takussan.app',
        first_name: 'Awa',
        last_name: 'Ndiaye',
        level: 'viewer',
      }),
    );
    await waitFor(() => expect(onInvited).toHaveBeenCalledTimes(1));
  });

  // TCK-600 (ADR-0047) — le niveau se choisit à l'invitation ; le moindre est proposé d'office.
  it('porte le niveau choisi', async () => {
    vi.mocked(inviteSuperAdmin).mockResolvedValue({} as never);
    renderModal({});
    const user = userEvent.setup();

    expect(screen.getByRole('radio', { name: /Lecture/ })).toBeChecked();
    await user.type(screen.getByLabelText(/email/i), 'support@takussan.app');
    await user.type(screen.getByLabelText(/prénom/i), 'Moussa');
    await user.type(screen.getByLabelText(/^Nom$/i), 'Sarr');
    await user.click(screen.getByRole('radio', { name: /Support/ }));
    await user.click(screen.getByRole('button', { name: /envoyer l’invitation/i }));

    await waitFor(() =>
      expect(inviteSuperAdmin).toHaveBeenCalledWith(expect.objectContaining({ level: 'support' })),
    );
  });
});
