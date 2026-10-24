/**
 * P228.02 (TCK-2212) — une note du tiroir du pipeline que l'API refuse (corps de plus de
 * 5 000 caractères, 403, réseau) reste dans le champ, et le refus se dit par
 * `useMessageErreurApi()` (ADR-0019). Avant, `NotesTab` vidait le champ dans le même gestionnaire
 * que l'envoi, et `noteMutation` n'avait qu'un `onSuccess` : le texte disparaissait sans message.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { withIntl } from '@/test/intl';
import { CustomerDetailSheet } from '../CustomerDetailSheet';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));

const pipeline = vi.hoisted(() => ({ fetchCustomerTasks: vi.fn() }));
vi.mock('@/lib/queries/pipeline', async (original) => ({
  ...(await original<typeof import('@/lib/queries/pipeline')>()),
  ...pipeline,
}));
const customers = vi.hoisted(() => ({
  createCustomerNote: vi.fn(),
  fetchCustomerNotes: vi.fn(),
  fetchDashboardCustomer: vi.fn(),
}));
vi.mock('@/lib/queries/customers', async (original) => ({
  ...(await original<typeof import('@/lib/queries/customers')>()),
  ...customers,
}));

const MESSAGE_API = 'Le texte ne doit pas dépasser 5000 caractères.';

async function ouvrirLesNotes() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    withIntl(
      <QueryClientProvider client={client}>
        <CustomerDetailSheet customerId={9} onOpenChange={() => {}} />
      </QueryClientProvider>,
    ),
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: /Notes/ }));
  const champ = await screen.findByPlaceholderText('Écrivez une note…');
  return { user, champ };
}

describe('CustomerDetailSheet — une note refusée reste dans le champ (P228.02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pipeline.fetchCustomerTasks.mockResolvedValue([]);
    customers.fetchCustomerNotes.mockResolvedValue([]);
    customers.fetchDashboardCustomer.mockResolvedValue(null);
  });

  it('un refus garde le texte et affiche le message de l’API', async () => {
    customers.createCustomerNote.mockRejectedValue(new ApiError(422, { message: MESSAGE_API }));
    const { user, champ } = await ouvrirLesNotes();

    await user.type(champ, 'Appel fait');
    await user.click(screen.getByRole('button', { name: 'Ajouter une note' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_API);
    expect(champ).toHaveValue('Appel fait');
  });

  it('un succès vide le champ, sans message', async () => {
    customers.createCustomerNote.mockResolvedValue({});
    const { user, champ } = await ouvrirLesNotes();

    await user.type(champ, 'Appel fait');
    await user.click(screen.getByRole('button', { name: 'Ajouter une note' }));

    await waitFor(() => expect(champ).toHaveValue(''));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('le champ porte la borne de l’API', async () => {
    const { champ } = await ouvrirLesNotes();

    expect(champ).toHaveAttribute('maxLength', '5000');
  });
});
