/**
 * TCK-2093 (P199.06) — l'onglet « Activité » de la fiche client se relit après chaque geste de la
 * fiche qui journalise : une note (page et tiroir du pipeline), une étape, une tâche (création et
 * bascule). Avant, la clé `AGENT_CRM_QUERY_KEY.activity` n'était invalidée nulle part : le geste
 * n'apparaissait dans le fil qu'après le `staleTime` de cinq minutes.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AGENT_CRM_QUERY_KEY } from '@/lib/queries/agent-crm';
import { withIntl } from '@/test/intl';
import { CustomerStageControl } from '../CustomerStageControl';
import { CustomerTasksPanel } from '../CustomerTasksPanel';
import { CustomerNotesTimeline } from '@/components/customer-dashboard/CustomerNotesTimeline';
import { CustomerDetailSheet } from '@/components/pipeline/CustomerDetailSheet';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));

const pipeline = vi.hoisted(() => ({
  patchCustomerPipelineStage: vi.fn(),
  fetchCustomerTasks: vi.fn(),
  createCustomerTask: vi.fn(),
  updateTask: vi.fn(),
}));
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
const createCustomerNoteAction = vi.hoisted(() => vi.fn());
vi.mock('@/app/actions/dashboard-customers', () => ({ createCustomerNoteAction }));

const CLIENT = 9;
const CLE = AGENT_CRM_QUERY_KEY.activity(CLIENT);

function monter(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(CLE, { pages: [], pageParams: [] });
  render(withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>));
  return { activiteInvalidee: () => client.getQueryState(CLE)?.isInvalidated === true };
}

const tache = { id: 4, title: 'Rappeler', status: 'open', due_at: null };

describe('TCK-2093 — le fil d’activité se relit après les gestes de la fiche', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pipeline.patchCustomerPipelineStage.mockResolvedValue({});
    pipeline.fetchCustomerTasks.mockResolvedValue([tache]);
    pipeline.createCustomerTask.mockResolvedValue(tache);
    pipeline.updateTask.mockResolvedValue({ ...tache, status: 'done' });
    customers.createCustomerNote.mockResolvedValue({});
    customers.fetchCustomerNotes.mockResolvedValue([]);
    customers.fetchDashboardCustomer.mockResolvedValue(null);
    createCustomerNoteAction.mockResolvedValue({ ok: true });
  });

  it('étape changée depuis la fiche', async () => {
    const { activiteInvalidee } = monter(<CustomerStageControl customerId={CLIENT} name="Awa Diop" stage="prospect" />);
    expect(activiteInvalidee()).toBe(false);
    await userEvent.click(screen.getByRole('combobox', { name: 'Étape de Awa Diop' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Qualifié' }));
    await waitFor(() => expect(activiteInvalidee()).toBe(true));
  });

  it('tâche créée', async () => {
    const user = userEvent.setup();
    const { activiteInvalidee } = monter(<CustomerTasksPanel customerId={CLIENT} />);
    await user.type(screen.getByLabelText('Titre de la tâche'), 'Rappeler');
    await user.click(screen.getByRole('button', { name: 'Ajouter une tâche' }));
    await waitFor(() => expect(activiteInvalidee()).toBe(true));
  });

  it('tâche basculée', async () => {
    const { activiteInvalidee } = monter(<CustomerTasksPanel customerId={CLIENT} />);
    await userEvent.click(await screen.findByLabelText('Marquer « Rappeler » comme faite'));
    await waitFor(() => expect(pipeline.updateTask).toHaveBeenCalled());
    await waitFor(() => expect(activiteInvalidee()).toBe(true));
  });

  it('note publiée depuis la page de la fiche', async () => {
    const user = userEvent.setup();
    const { activiteInvalidee } = monter(<CustomerNotesTimeline customerId={CLIENT} notes={[]} />);
    await user.type(screen.getByPlaceholderText(/Compte rendu d'appel/), 'Appel fait');
    await user.click(screen.getByRole('button', { name: /Publier/ }));
    await waitFor(() => expect(createCustomerNoteAction).toHaveBeenCalledWith(CLIENT, 'Appel fait'));
    await waitFor(() => expect(activiteInvalidee()).toBe(true));
  });

  it('note ajoutée depuis le tiroir du pipeline', async () => {
    const user = userEvent.setup();
    const { activiteInvalidee } = monter(<CustomerDetailSheet customerId={CLIENT} onOpenChange={() => {}} />);
    await user.click(screen.getByRole('tab', { name: /Notes/ }));
    await user.type(await screen.findByPlaceholderText('Écrivez une note…'), 'Appel fait');
    await user.click(screen.getByRole('button', { name: 'Ajouter une note' }));
    await waitFor(() => expect(customers.createCustomerNote).toHaveBeenCalled());
    await waitFor(() => expect(activiteInvalidee()).toBe(true));
  });
});
