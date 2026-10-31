import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fetchAdminAiDashboard } from '@/lib/queries/super-admin';
import { withIntl } from '@/test/intl';
import { AiDashboardPanel } from '../AiDashboardPanel';

vi.mock('@/lib/queries/super-admin', () => ({ fetchAdminAiDashboard: vi.fn() }));

describe('coûts IA (TCK-2385)', () => {
  it('montre le dernier score d’évaluation de chaque usage, et le taux d’acceptation', async () => {
    vi.mocked(fetchAdminAiDashboard).mockResolvedValue({ data: {
      days: [],
      acceptance: { 'essai.extraction': { decided: 4, accepted: 3, edited: 0, rejected: 1, rate: 0.75 } },
      baselines: { 'essai.extraction': { global: 0.9, fields: { titre: 1 }, model: 'anthropic/modele-a', prompt_version: 2, updated_at: '2026-10-20T03:00:00+00:00' } },
      today: { spent_xof: 12.5, daily_budget_xof: 5000 },
    } });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(withIntl(<QueryClientProvider client={queryClient}><AiDashboardPanel /></QueryClientProvider>));

    const table = await screen.findByRole('table', { name: 'Dernier score d’évaluation par usage' });
    const ligne = within(table).getByRole('row', { name: /essai\.extraction/ });
    expect(ligne).toHaveTextContent('0,90');
    expect(ligne).toHaveTextContent('anthropic/modele-a');
    expect(ligne).toHaveTextContent(/2026/);
    expect(screen.getByRole('table', { name: 'Taux d’acceptation des suggestions' })).toHaveTextContent('75 %');
    expect(screen.getByText(/12,50 XOF dépensés sur 5000 XOF/)).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('dit qu’un fournisseur a refusé des appels que le secours a effacés (TCK-2449)', async () => {
    const jour = { usage_key: 'essai.extraction', calls: 3, cost_xof: 1, avg_duration_ms: 100, errors: 0, refusals: 0, failovers: 2, cache_hits: 0 };
    vi.mocked(fetchAdminAiDashboard).mockResolvedValue({ data: {
      days: [{ ...jour, date: '2026-10-30', provider_rejections: 2 }, { ...jour, date: '2026-10-31', provider_rejections: 1 }],
      acceptance: {},
      baselines: {},
      today: { spent_xof: 0, daily_budget_xof: null },
    } });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(withIntl(<QueryClientProvider client={queryClient}><AiDashboardPanel /></QueryClientProvider>));

    expect(await screen.findByRole('status')).toHaveTextContent('3 appels ont basculé sur le maillon suivant');
    const ligne = within(screen.getByRole('table', { name: 'Appels par jour et par usage' })).getByRole('row', { name: /2026-10-30/ });
    expect(within(ligne).getAllByRole('cell').at(-1)).toHaveTextContent('2');
  });
});
