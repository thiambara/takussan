/**
 * TCK-2481 (revue adverse, M3) — l'alerte d'erreur du pipeline ne se pose pas sur la barre d'onglets.
 *
 * L'alerte est `fixed` et ne passe pas par le dock flottant (`useFloatingDockSlot`). Ancrée en
 * `bottom-24 sm:bottom-4`, elle tombait entre 640 et 767 px à 16 px du bas — sur la barre de 56 px,
 * dont elle couvrait les onglets. Elle lit désormais `--floating-dock-base`, que la coque à barre
 * redéfinit sous `md` (`[data-barre-onglets]`, gardé par `CoqueHauteur.test.tsx`) ; dès `md`, elle
 * garde ses 16 px.
 *
 * jsdom n'applique pas `globals.css` : c'est la CLASSE écrite qui est gardée.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { PipelineKanban } from '../PipelineKanban';

const mocks = vi.hoisted(() => ({ fetchPipelineColumn: vi.fn() }));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token', user: null }),
}));

vi.mock('@/lib/queries/pipeline', () => ({
  PIPELINE_STAGES: ['lead', 'prospect', 'qualified', 'negotiating', 'converted', 'lost'],
  PIPELINE_COLUMN_PAGE_SIZE: 50,
  fetchPipelineColumn: mocks.fetchPipelineColumn,
  fetchPipelineStats: vi.fn(() =>
    Promise.resolve({
      stage_counts: { lead: 73, prospect: 0, qualified: 0, negotiating: 0, converted: 0, lost: 0 },
      stage_changes_last_30d: 0,
      avg_time_in_stage: {},
      conversion_rate: 0,
    }),
  ),
  patchCustomerPipelineStage: vi.fn(),
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

describe('<PipelineKanban> — l’alerte d’erreur et la barre d’onglets (TCK-2481, M3)', () => {
  it('se pose sur la base du dock flottant sous md, à 16 px dès md', async () => {
    mocks.fetchPipelineColumn.mockImplementation((_t: string, { stage, page }: { stage: string; page?: number }) => {
      if (stage !== 'lead') return Promise.resolve([]);
      if (page === 2) return Promise.reject(new Error('réseau'));
      return Promise.resolve(Array.from({ length: 50 }, (_, i) => carte(1 + i)));
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      withIntl(
        <QueryClientProvider client={queryClient}>
          <PipelineKanban />
        </QueryClientProvider>,
      ),
    );
    await screen.findAllByTestId('pipeline-column-lead', {}, { timeout: 3000 });
    const desktop = within(screen.getByTestId('pipeline-kanban')).getByTestId('pipeline-column-lead');
    await userEvent.setup().click(await within(desktop).findByRole('button', { name: /Charger plus/ }));

    const alerte = await screen.findByRole('alert');
    const classes = alerte.className.split(/\s+/);
    expect(classes).toContain('bottom-[var(--floating-dock-base)]');
    expect(classes).toContain('md:bottom-4');
    // Aucun autre ancrage bas entre 0 et md : c'est lui qui posait l'alerte sur la barre.
    expect(classes.filter((c) => /^(sm:)?bottom-/.test(c))).toEqual(['bottom-[var(--floating-dock-base)]']);
  });
});
