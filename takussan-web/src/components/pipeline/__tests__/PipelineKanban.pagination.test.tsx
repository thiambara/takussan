/**
 * TCK-591, AC25 — le compte d'une étape vient de `stage_counts`, pas de la liste chargée (qui
 * plafonnait à 50 et se lisait comme le total) ; « Charger plus » demande la page 2 et l'ajoute.
 * Et l'étape se change sans glisser, par le sélecteur de la carte (AC15).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { PipelineKanban } from '../PipelineKanban';

const mocks = vi.hoisted(() => ({
  fetchPipelineColumn: vi.fn(),
  patchCustomerPipelineStage: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token', user: null }),
}));

vi.mock('@/lib/queries/pipeline', () => ({
  PIPELINE_STAGES: ['lead', 'prospect', 'qualified', 'negotiating', 'converted', 'lost'],
  PIPELINE_COLUMN_PAGE_SIZE: 50,
  fetchPipelineColumn: mocks.fetchPipelineColumn,
  fetchPipelineStats: vi.fn(() => Promise.resolve({
    stage_counts: { lead: 73, prospect: 0, qualified: 0, negotiating: 0, converted: 0, lost: 0 },
    stage_changes_last_30d: 0,
    avg_time_in_stage: {},
    conversion_rate: 0,
  })),
  patchCustomerPipelineStage: mocks.patchCustomerPipelineStage,
  fetchCustomerTasks: vi.fn(() => Promise.resolve([])),
  createCustomerTask: vi.fn(),
  updateTask: vi.fn(),
}));

const carte = (id: number) => ({
  id,
  first_name: 'Client',
  last_name: `n°${id}`,
  phone: null,
  pipeline_stage: 'lead' as const,
  created_at: '2026-09-01T08:00:00Z',
  updated_at: '2026-09-01T08:00:00Z',
  added_by_id: null,
  tasks_count: 0,
});

function rendu() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(withIntl(
    <QueryClientProvider client={queryClient}>
      <PipelineKanban />
    </QueryClientProvider>,
  ));
}

describe('<PipelineKanban> — comptes, pagination, étape sans glisser', () => {
  beforeEach(() => {
    mocks.fetchPipelineColumn.mockReset();
    mocks.patchCustomerPipelineStage.mockReset();
    mocks.fetchPipelineColumn.mockImplementation((_token: string, { stage, page }: { stage: string; page?: number }) => {
      if (stage !== 'lead') return Promise.resolve([]);
      if (page === 2) return Promise.resolve(Array.from({ length: 23 }, (_, i) => carte(51 + i)));
      return Promise.resolve(Array.from({ length: 50 }, (_, i) => carte(1 + i)));
    });
  });

  it('affiche 73 sur l’onglet et la colonne, puis charge la 51ᵉ carte en page 2', async () => {
    rendu();
    // La colonne « lead » existe deux fois : vue mobile (un onglet à la fois), puis le kanban.
    const colonnes = await screen.findAllByTestId('pipeline-column-lead', {}, { timeout: 3000 });
    const desktop = within(screen.getByTestId('pipeline-kanban')).getByTestId('pipeline-column-lead');
    expect(colonnes).toHaveLength(2);

    await waitFor(() => expect(within(desktop).getByText('73')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^Lead/, pressed: true })).toHaveTextContent('(73)');
    expect(within(desktop).queryByText('Client n°51')).not.toBeInTheDocument();

    await userEvent.setup().click(within(desktop).getByRole('button', { name: 'Charger plus (50 sur 73)' }));

    expect(await within(desktop).findByText('Client n°51')).toBeInTheDocument();
    expect(mocks.fetchPipelineColumn).toHaveBeenCalledWith('test-token', { stage: 'lead', page: 2 });
    expect(within(desktop).queryByRole('button', { name: /Charger plus/ })).not.toBeInTheDocument();
  });

  it('change l’étape par le sélecteur de la carte, sans ouvrir la fiche', async () => {
    mocks.patchCustomerPipelineStage.mockResolvedValue({ ...carte(1), pipeline_stage: 'prospect' });
    rendu();

    const selects = await screen.findAllByRole('combobox', { name: 'Étape de Client n°1' }, { timeout: 3000 });
    await userEvent.setup().selectOptions(selects[0], 'prospect');

    await waitFor(() =>
      expect(mocks.patchCustomerPipelineStage).toHaveBeenCalledWith('test-token', 1, 'prospect', undefined),
    );
    expect(screen.queryByTestId('customer-detail-sheet')).not.toBeInTheDocument();
  });

  it('demande le motif avant une étape terminale', async () => {
    rendu();

    const selects = await screen.findAllByRole('combobox', { name: 'Étape de Client n°1' }, { timeout: 3000 });
    await userEvent.setup().selectOptions(selects[0], 'lost');

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(mocks.patchCustomerPipelineStage).not.toHaveBeenCalled();
  });
});
