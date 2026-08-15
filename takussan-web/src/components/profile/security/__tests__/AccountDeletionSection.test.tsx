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
const sendAccountDeletionStepUpCodeActionMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('@/app/actions/account-deletion', () => ({
  getAccountDeletionRequestAction: () => getAccountDeletionRequestActionMock(),
  cancelAccountDeletionAction: () => cancelAccountDeletionActionMock(),
  requestAccountDeletionAction: (...args: unknown[]) => requestAccountDeletionActionMock(...args),
  sendAccountDeletionStepUpCodeAction: () => sendAccountDeletionStepUpCodeActionMock(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

function renderSection(locale: 'fr' | 'en', hasUsablePassword = true) {
  const messages = locale === 'fr' ? frMessages : enMessages;

  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <AccountDeletionSection twoFactorEnabled={false} hasUsablePassword={hasUsablePassword} />
    </NextIntlClientProvider>,
  );
}

/** Ouvre le dialogue et avance jusqu'à l'étape 2 (le step-up). */
async function openStepTwo(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Supprimer mon compte' }));
  await user.click(screen.getByLabelText('Préoccupations de vie privée'));
  await user.click(screen.getByRole('button', { name: 'Continuer' }));
}

describe('AccountDeletionSection i18n', () => {
  beforeEach(() => {
    getAccountDeletionRequestActionMock.mockResolvedValue({ ok: true, data: null });
    cancelAccountDeletionActionMock.mockResolvedValue({ ok: true, data: null });
    requestAccountDeletionActionMock.mockReset();
    requestAccountDeletionActionMock.mockResolvedValue({
      ok: true,
      data: { id: 1, days_remaining: 30, requested_at: null, scheduled_for: null },
    });
    sendAccountDeletionStepUpCodeActionMock.mockReset();
    sendAccountDeletionStepUpCodeActionMock.mockResolvedValue({ ok: true, data: null });
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

/**
 * TCK-272 — l'étape 2 du dialogue a deux visages. Le choix vient du
 * backend via `hasUsablePassword` ; l'utilisateur, lui, ne voit qu'un seul
 * parcours, celui qui marche pour son compte.
 */
describe('AccountDeletionDialog step-up branches (TCK-272)', () => {
  beforeEach(() => {
    getAccountDeletionRequestActionMock.mockResolvedValue({ ok: true, data: null });
    cancelAccountDeletionActionMock.mockResolvedValue({ ok: true, data: null });
    requestAccountDeletionActionMock.mockReset();
    requestAccountDeletionActionMock.mockResolvedValue({
      ok: true,
      data: { id: 1, days_remaining: 30, requested_at: null, scheduled_for: null },
    });
    sendAccountDeletionStepUpCodeActionMock.mockReset();
    sendAccountDeletionStepUpCodeActionMock.mockResolvedValue({ ok: true, data: null });
    refreshMock.mockReset();
  });

  it('asks for the password when the account has a usable one', async () => {
    const user = userEvent.setup();
    renderSection('fr', true);
    await openStepTwo(user);

    expect(screen.getByLabelText('Mot de passe')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "M'envoyer un code par e-mail" })).not.toBeInTheDocument();
  });

  it('submits the password and never a step-up code', async () => {
    const user = userEvent.setup();
    renderSection('fr', true);
    await openStepTwo(user);

    await user.type(screen.getByLabelText('Mot de passe'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Supprimer définitivement' }));

    await waitFor(() => expect(requestAccountDeletionActionMock).toHaveBeenCalledTimes(1));
    const payload = requestAccountDeletionActionMock.mock.calls[0][0];
    expect(payload.password).toBe('correct-horse');
    expect(payload.step_up_code).toBeUndefined();
  });

  it('offers the e-mail code — and no password field — when the account has none', async () => {
    const user = userEvent.setup();
    renderSection('fr', false);
    await openStepTwo(user);

    expect(screen.queryByLabelText('Mot de passe')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: "M'envoyer un code par e-mail" })).toBeInTheDocument();
    expect(screen.getByLabelText('Code reçu par e-mail (6 chiffres)')).toBeInTheDocument();
  });

  it('sends the code on demand and confirms it to the user', async () => {
    const user = userEvent.setup();
    renderSection('fr', false);
    await openStepTwo(user);

    await user.click(screen.getByRole('button', { name: "M'envoyer un code par e-mail" }));

    await waitFor(() => expect(sendAccountDeletionStepUpCodeActionMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('status')).toHaveTextContent(
      "Code envoyé. Il est valable 5 minutes et ne sert qu'une fois.",
    );
    expect(screen.getByRole('button', { name: 'Renvoyer un code' })).toBeInTheDocument();
  });

  it('submits the step-up code and never a password', async () => {
    const user = userEvent.setup();
    renderSection('fr', false);
    await openStepTwo(user);

    await user.type(screen.getByLabelText('Code reçu par e-mail (6 chiffres)'), '123456');
    await user.click(screen.getByRole('button', { name: 'Supprimer définitivement' }));

    await waitFor(() => expect(requestAccountDeletionActionMock).toHaveBeenCalledTimes(1));
    const payload = requestAccountDeletionActionMock.mock.calls[0][0];
    expect(payload.step_up_code).toBe('123456');
    expect(payload.password).toBeUndefined();
  });

  it('keeps the confirm button disabled until a 6-digit code is typed', async () => {
    const user = userEvent.setup();
    renderSection('fr', false);
    await openStepTwo(user);

    const confirm = screen.getByRole('button', { name: 'Supprimer définitivement' });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText('Code reçu par e-mail (6 chiffres)'), '12345');
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText('Code reçu par e-mail (6 chiffres)'), '6');
    expect(confirm).toBeEnabled();
  });

  it('surfaces the server error instead of blaming a typed password', async () => {
    const user = userEvent.setup();
    requestAccountDeletionActionMock.mockResolvedValue({
      ok: false,
      message: 'Code de confirmation invalide ou expiré.',
    });
    renderSection('fr', false);
    await openStepTwo(user);

    await user.type(screen.getByLabelText('Code reçu par e-mail (6 chiffres)'), '000000');
    await user.click(screen.getByRole('button', { name: 'Supprimer définitivement' }));

    expect(await screen.findByText('Code de confirmation invalide ou expiré.')).toBeInTheDocument();
    expect(screen.queryByText('Mot de passe incorrect.')).not.toBeInTheDocument();
  });
});
