import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enMessages from '@/messages/en.json';
import frMessages from '@/messages/fr.json';
import { AccountDeletionSection } from '../AccountDeletionSection';

const getAccountDeletionRequestActionMock = vi.fn();
const cancelAccountDeletionActionMock = vi.fn();
const requestAccountDeletionActionMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('@/app/actions/account-deletion', () => ({
  getAccountDeletionRequestAction: () => getAccountDeletionRequestActionMock(),
  cancelAccountDeletionAction: () => cancelAccountDeletionActionMock(),
  requestAccountDeletionAction: (...args: unknown[]) => requestAccountDeletionActionMock(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

function renderSection(locale: 'fr' | 'en') {
  const messages = locale === 'fr' ? frMessages : enMessages;

  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <AccountDeletionSection twoFactorEnabled={false} />
    </NextIntlClientProvider>,
  );
}

describe('AccountDeletionSection i18n', () => {
  beforeEach(() => {
    getAccountDeletionRequestActionMock.mockResolvedValue({ ok: true, data: null });
    cancelAccountDeletionActionMock.mockResolvedValue({ ok: true, data: null });
    requestAccountDeletionActionMock.mockResolvedValue({
      ok: true,
      data: { id: 1, days_remaining: 30, requested_at: null, scheduled_for: null },
    });
    refreshMock.mockReset();
  });

  it('renders the account deletion section and dialog in French', async () => {
    const user = userEvent.setup();
    renderSection('fr');

    expect(await screen.findByRole('heading', { name: 'Supprimer mon compte' })).toBeInTheDocument();
    expect(screen.queryByText('Delete my account')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Supprimer mon compte' }));

    expect(screen.getByRole('dialog', { name: 'Supprimer votre compte' })).toBeInTheDocument();
    expect(screen.getAllByText('Pourquoi souhaitez-vous partir ?')).toHaveLength(2);
    expect(screen.queryByText('Why are you leaving?')).not.toBeInTheDocument();
  });

  it('keeps English labels valid when locale is English', async () => {
    renderSection('en');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Delete my account' })).toBeInTheDocument();
    });
    expect(screen.getByText('Deletion is irreversible after the grace period. Your personal data is anonymized and legal records are retained.')).toBeInTheDocument();
  });
});
