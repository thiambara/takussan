import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';

import frMessages from '@/messages/fr.json';
import { PipelineKanban } from '../PipelineKanban';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token', user: null }),
}));

vi.mock('@/lib/queries/pipeline', async () => {
  const stages = [
    'lead',
    'prospect',
    'qualified',
    'negotiating',
    'converted',
    'lost',
  ] as const;
  return {
    PIPELINE_STAGES: stages,
    fetchPipelineColumn: vi.fn(({ stage }: { stage: string }) =>
      Promise.resolve(
        stage === 'lead'
          ? [
              {
                id: 1,
                first_name: 'Awa',
                last_name: 'Diop',
                pipeline_stage: 'lead',
                created_at: '2026-04-23T08:00:00Z',
                updated_at: '2026-04-23T08:00:00Z',
                added_by_id: 99,
                tasks_count: 0,
              },
            ]
          : [],
      ),
    ),
    fetchPipelineStats: vi.fn(() =>
      Promise.resolve({
        stage_counts: {
          lead: 1,
          prospect: 0,
          qualified: 0,
          negotiating: 0,
          converted: 0,
          lost: 0,
        },
        stage_changes_last_30d: 0,
        avg_time_in_stage: {},
        conversion_rate: 0,
      }),
    ),
    patchCustomerPipelineStage: vi.fn(),
    fetchCustomerTasks: vi.fn(() => Promise.resolve([])),
    createCustomerTask: vi.fn(),
    updateTask: vi.fn(),
  };
});

function renderKanban() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // Pre-populate the lead column cache so the kanban can render the card
  // synchronously — useQueries with the same `queryKey` will return our
  // payload immediately without waiting for the mocked fetch to resolve.
  queryClient.setQueryData(['crm-pipeline', 'column', 'lead'], [
    {
      id: 1,
      first_name: 'Awa',
      last_name: 'Diop',
      pipeline_stage: 'lead',
      created_at: '2026-04-23T08:00:00Z',
      updated_at: '2026-04-23T08:00:00Z',
      added_by_id: 99,
      tasks_count: 0,
    },
  ]);
  return render(
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      <QueryClientProvider client={queryClient}>
        <PipelineKanban />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('<PipelineKanban>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders 6 stage columns', async () => {
    renderKanban();
    // Wait for the columns to render — both mobile tabs (text-only) and
    // desktop columns appear, so each label shows up at least once.
    const leadElements = await screen.findAllByText('Lead');
    expect(leadElements.length).toBeGreaterThan(0);

    for (const stage of ['Prospect', 'Qualifié', 'Négociation', 'Converti', 'Perdu']) {
      expect(screen.getAllByText(stage).length).toBeGreaterThan(0);
    }

    // The 6 desktop columns expose a stable test id we can rely on.
    const columns = await screen.findAllByTestId(/^pipeline-column-/);
    // 6 desktop + 1 mobile (always one stage rendered) = 7
    expect(columns.length).toBeGreaterThanOrEqual(6);
  });

  it('shows the customer card after fetch', async () => {
    const { container } = renderKanban();
    await waitFor(
      () => {
        const cards = container.querySelectorAll('[data-customer-id]');
        if (cards.length === 0) throw new Error('still empty');
      },
      { timeout: 3000 },
    );
    const card = container.querySelector('[data-customer-id]');
    expect(card?.textContent).toMatch(/Awa.*Diop/);
  });
});
