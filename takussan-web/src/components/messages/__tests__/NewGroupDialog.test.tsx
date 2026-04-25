import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import frMessages from '@/messages/fr.json';
import { NewGroupDialog } from '../NewGroupDialog';

const mutateAsyncMock = vi.fn();

vi.mock('@/lib/queries/conversations', () => ({
  useCreateGroupConversation: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
}));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}

describe('<NewGroupDialog>', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset();
  });

  it('refuses to advance to step 2 with too few participants', async () => {
    const user = userEvent.setup();
    render(wrap(<NewGroupDialog open onClose={() => {}} />));

    // Add 1 participant only (need 2 minimum)
    await user.type(screen.getByPlaceholderText('ID utilisateur'), '42');
    await user.click(screen.getByRole('button', { name: 'Ajouter' }));

    await user.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(
      await screen.findByText(/Minimum 3 participants au total/),
    ).toBeInTheDocument();
  });

  it('rejects duplicates', async () => {
    const user = userEvent.setup();
    render(wrap(<NewGroupDialog open onClose={() => {}} />));

    await user.type(screen.getByPlaceholderText('ID utilisateur'), '5');
    await user.click(screen.getByRole('button', { name: 'Ajouter' }));
    await user.type(screen.getByPlaceholderText('ID utilisateur'), '5');
    await user.click(screen.getByRole('button', { name: 'Ajouter' }));

    expect(
      await screen.findByText(/déjà ajouté/),
    ).toBeInTheDocument();
  });

  it('calls create with valid payload after wizard completion', async () => {
    const user = userEvent.setup();
    mutateAsyncMock.mockResolvedValue({ data: { id: 99 } });
    const onCreated = vi.fn();
    const onClose = vi.fn();
    render(wrap(<NewGroupDialog open onClose={onClose} onCreated={onCreated} />));

    // Add 2 participants
    await user.type(screen.getByPlaceholderText('ID utilisateur'), '5');
    await user.click(screen.getByRole('button', { name: 'Ajouter' }));
    await user.type(screen.getByPlaceholderText('ID utilisateur'), '6');
    await user.click(screen.getByRole('button', { name: 'Ajouter' }));

    await user.click(screen.getByRole('button', { name: 'Suivant' }));

    // Step 2: subject
    await user.type(screen.getByLabelText('Sujet'), 'Visite Almadies');
    await user.click(screen.getByRole('button', { name: 'Créer le groupe' }));

    expect(mutateAsyncMock).toHaveBeenCalledWith({
      type: 'group',
      subject: 'Visite Almadies',
      participants: [5, 6],
    });
    expect(onCreated).toHaveBeenCalledWith(99);
    expect(onClose).toHaveBeenCalled();
  });
});
