import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchScheduler } from '@/lib/queries/super-admin';
import type { ScheduledTask } from '@/types/super-admin';
import { withIntl } from '@/test/intl';
import { ScheduledTaskTable } from '../scheduler';

vi.mock('@/lib/queries/super-admin', () => ({ fetchScheduler: vi.fn() }));

function tache(overrides: Partial<ScheduledTask> = {}): ScheduledTask {
  return {
    task: 'daily-cleanup',
    last_run_at: '2026-08-27T02:00:00.000Z',
    last_status: 'finished',
    next_due_at: null,
    average_duration_ms: 120,
    ...overrides,
  };
}

function rendre(taches: ScheduledTask[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(fetchScheduler).mockResolvedValue({ data: taches });

  return render(withIntl(
    <QueryClientProvider client={queryClient}>
      <ScheduledTaskTable />
    </QueryClientProvider>,
  ));
}

describe('ScheduledTaskTable — TCK-383', () => {
  beforeEach(() => vi.clearAllMocks());

  it("distingue à l'écran une tâche en échec d'une tâche réussie", async () => {
    rendre([
      tache({ task: 'daily-cleanup', last_status: 'finished' }),
      tache({ task: 'media-cleanup', last_status: 'failed' }),
    ]);

    // Ce que l'utilisateur LIT, pas la présence d'un nœud : deux libellés distincts.
    expect(await screen.findByText('Terminée')).toBeInTheDocument();
    expect(screen.getByText('En échec')).toBeInTheDocument();
  });

  it('avoue un statut inconnu au lieu de le taire', async () => {
    rendre([tache({ last_status: 'quelque-chose-de-neuf' })]);

    expect(await screen.findByText('quelque-chose-de-neuf')).toBeInTheDocument();
  });

  it("affiche « — » quand aucune exécution n'a été mesurée, et « 0ms » quand elle l'a été à zéro", async () => {
    rendre([
      tache({ task: 'jamais-mesuree', average_duration_ms: null }),
      tache({ task: 'mesuree-a-zero', average_duration_ms: 0 }),
    ]);

    expect(await screen.findByText('0ms')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
