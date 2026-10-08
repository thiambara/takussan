/**
 * TCK-591 §3 — « Mes tâches » : le filtre d'échéance part au serveur (`filter[due]`), une tâche se
 * coche, et une tâche rattachée à un client porte ses gestes de contact et le lien vers sa fiche.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { MyTasks } from '../MyTasks';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }),
}));
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/app/tasks',
}));

const fetchMyTasks = vi.fn();
const setTaskDone = vi.fn();
vi.mock('@/lib/queries/agent-crm', async (original) => ({
  ...(await original<typeof import('@/lib/queries/agent-crm')>()),
  fetchMyTasks: (...args: unknown[]) => fetchMyTasks(...args),
  setTaskDone: (...args: unknown[]) => setTaskDone(...args),
}));

const tache = {
  id: 5,
  title: 'Rappeler Awa',
  status: 'open',
  priority: 'medium',
  due_at: '2026-10-07T15:00:00Z',
  taskable: { type: 'customer', id: 9, label: 'Awa Diop', phone: '+221771234567' },
  assignee: null,
};

function rendu() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <MyTasks initialDue="today" />
    </QueryClientProvider>,
  ));
}

describe('MyTasks', () => {
  beforeEach(() => {
    fetchMyTasks.mockReset();
    setTaskDone.mockReset();
    replace.mockReset();
    fetchMyTasks.mockResolvedValue({ data: [tache], meta: { current_page: 1, last_page: 1, per_page: 30, total: 1 } });
  });

  it('demande les tâches du jour, et cocher marque la tâche faite', async () => {
    setTaskDone.mockResolvedValue(undefined);
    rendu();

    const coche = await screen.findByRole('checkbox', { name: 'Marquer « Rappeler Awa » comme faite' });
    expect(fetchMyTasks).toHaveBeenCalledWith('jeton', 'today', 1);
    expect(screen.getByRole('link', { name: 'Awa Diop' })).toHaveAttribute('href', '/app/customers/9');
    expect(screen.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', expect.stringContaining('wa.me/221771234567'));

    await userEvent.setup().click(coche);
    await waitFor(() => expect(setTaskDone).toHaveBeenCalledWith('jeton', 5, true));
  });

  it('change de filtre, et l’URL le garde', async () => {
    rendu();
    await screen.findByText('Rappeler Awa');

    await userEvent.setup().click(screen.getByRole('button', { name: 'En retard' }));

    await waitFor(() => expect(fetchMyTasks).toHaveBeenCalledWith('jeton', 'overdue', 1));
    expect(replace).toHaveBeenCalledWith('/app/tasks?filter[due]=overdue', { scroll: false });
  });
});
