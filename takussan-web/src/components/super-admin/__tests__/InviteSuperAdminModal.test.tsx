import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/ui/toast';
import { inviteSuperAdmin } from '@/lib/queries/super-admin';
import { InviteSuperAdminModal } from '../InviteSuperAdminModal';

vi.mock('@/lib/queries/super-admin', () => ({
  inviteSuperAdmin: vi.fn(),
}));

function renderModal(overrides: { onInvited?: () => void } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <ToastProvider>
      <NextIntlClientProvider locale="fr" messages={{ common: { actions: { close: 'Fermer' } } }}>
        <QueryClientProvider client={queryClient}>
          <InviteSuperAdminModal open onOpenChange={() => {}} onInvited={overrides.onInvited} />
        </QueryClientProvider>
      </NextIntlClientProvider>
    </ToastProvider>,
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
      }),
    );
    await waitFor(() => expect(onInvited).toHaveBeenCalledTimes(1));
  });
});
