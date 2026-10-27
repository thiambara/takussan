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
  });
});
