/**
 * P244.01 (TCK-2361) — dans le tableau, `ReasonDialog` lançait `runStageMutation` puis
 * `setPendingReason(null)` dans le même gestionnaire : sur un refus, le dialogue était déjà fermé
 * et le motif saisi perdu. Patron de TCK-2212 : fermeture sur le succès, motif gardé et erreur dite
 * dans le dialogue sur un refus.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';

import { ApiError } from '@/lib/api';
import frMessages from '@/messages/fr.json';
import { PipelineKanban } from '../PipelineKanban';

const m = vi.hoisted(() => ({ patch: vi.fn() }));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token', user: null }),
}));

vi.mock('@/lib/queries/pipeline', async () => {
  const stages = ['lead', 'prospect', 'qualified', 'negotiating', 'converted', 'lost'] as const;
  return {
    PIPELINE_STAGES: stages,
    PIPELINE_COLUMN_PAGE_SIZE: 50,
    fetchPipelineColumn: vi.fn(({ stage }: { stage: string }) => Promise.resolve(stage === 'lead' ? [awaCard] : [])),
    fetchPipelineStats: vi.fn(() =>
      Promise.resolve({
        stage_counts: { lead: 1, prospect: 0, qualified: 0, negotiating: 0, converted: 0, lost: 0 },
        stage_changes_last_30d: 0,
        avg_time_in_stage: {},
        conversion_rate: 0,
      }),
    ),
    patchCustomerPipelineStage: (...a: unknown[]) => m.patch(...a),
    fetchCustomerTasks: vi.fn(() => Promise.resolve([])),
    createCustomerTask: vi.fn(),
    updateTask: vi.fn(),
  };
});

const awaCard = vi.hoisted(() => ({
  id: 1,
  first_name: 'Awa',
  last_name: 'Diop',
  pipeline_stage: 'lead',
  created_at: '2026-04-23T08:00:00Z',
  updated_at: '2026-04-23T08:00:00Z',
  added_by_id: 99,
  tasks_count: 0,
}));

function renderKanban() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(['crm-pipeline', 'column', 'lead'], [awaCard]);
  return render(
    <NextIntlClientProvider locale="fr" messages={frMessages} onError={() => {}}>
      <QueryClientProvider client={queryClient}>
        <PipelineKanban />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

async function passerEnPerduAvecMotif(motif: string) {
  const user = userEvent.setup();
  const [select] = await screen.findAllByLabelText('Étape de Awa Diop');
  await user.selectOptions(select, 'lost');
  await user.type(await screen.findByTestId('reason-input'), motif);
  await user.click(screen.getByTestId('reason-submit'));
}

describe('<PipelineKanban> — motif refusé (P244.01)', () => {
  beforeEach(() => {
    m.patch.mockReset();
  });

  it('refus : le dialogue reste ouvert avec le motif, et l’erreur s’y lit', async () => {
    m.patch.mockRejectedValue(
      new ApiError(422, { message: 'Le motif est trop long.', errors: { reason: ['Le motif est trop long.'] } }),
    );
    renderKanban();

    await passerEnPerduAvecMotif('Budget insuffisant');

    await waitFor(() => expect(m.patch).toHaveBeenCalledWith('test-token', 1, 'lost', 'Budget insuffisant'));
    const dialogue = await screen.findByRole('dialog');
    expect(await within(dialogue).findByRole('alert')).toHaveTextContent('Le motif est trop long.');
    expect(within(dialogue).getByTestId('reason-input')).toHaveValue('Budget insuffisant');
  });

  it('succès : le dialogue se ferme', async () => {
    m.patch.mockResolvedValue({ ...awaCard, pipeline_stage: 'lost' });
    renderKanban();

    await passerEnPerduAvecMotif('Budget insuffisant');

    await waitFor(() => expect(m.patch).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('reason-input')).not.toBeInTheDocument());
  });
});
