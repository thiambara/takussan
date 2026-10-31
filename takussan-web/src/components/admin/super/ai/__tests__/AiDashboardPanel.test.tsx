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
      today: { spent_usd: '12.5', daily_budget_usd: '8.33' },
      usd_to_xof: '600',
    } });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(withIntl(<QueryClientProvider client={queryClient}><AiDashboardPanel /></QueryClientProvider>));

    const table = await screen.findByRole('table', { name: 'Dernier score d’évaluation par usage' });
    const ligne = within(table).getByRole('row', { name: /essai\.extraction/ });
    expect(ligne).toHaveTextContent('0,90');
    expect(ligne).toHaveTextContent('anthropic/modele-a');
    expect(ligne).toHaveTextContent(/2026/);
    expect(screen.getByRole('table', { name: 'Taux d’acceptation des suggestions' })).toHaveTextContent('75 %');
    expect(screen.getByText(/\$12\.50 \(≈ 7\s500\s*F\s*CFA\) dépensés sur \$8\.33 \(≈ 4\s998\s*F\s*CFA\)/)).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('AC10 — le coût se lit en dollars et son équivalent « ≈ » en XOF, et un coût minuscule ne se lit pas 0', async () => {
    vi.mocked(fetchAdminAiDashboard).mockResolvedValue({ data: {
      days: [{ date: '2026-10-31', usage_key: 'essai.extraction', calls: 1, cost_usd: '0.00000000004', avg_duration_ms: 100, errors: 0, refusals: 0, failovers: 0, cache_hits: 0, provider_rejections: 0 }],
      acceptance: {},
      baselines: {},
      today: { spent_usd: '0.00000000004', daily_budget_usd: null },
      usd_to_xof: '600',
    } });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(withIntl(<QueryClientProvider client={queryClient}><AiDashboardPanel /></QueryClientProvider>));

    const ligne = await screen.findByRole('row', { name: /essai\.extraction/ });
    expect(ligne).toHaveTextContent(/\$0\.00000000004 \(≈ 0,000000024\s*F\s*CFA\)/);
    expect(screen.getByText(/Aujourd’hui : \$0\.00000000004 \(≈ 0,000000024\s*F\s*CFA\) dépensés, sans plafond global/)).toBeInTheDocument();
  });

  it('dit qu’un fournisseur a refusé des appels que le secours a effacés (TCK-2449)', async () => {
    const jour = { usage_key: 'essai.extraction', calls: 3, cost_usd: '1', avg_duration_ms: 100, errors: 0, refusals: 0, failovers: 2, cache_hits: 0 };
    vi.mocked(fetchAdminAiDashboard).mockResolvedValue({ data: {
      days: [{ ...jour, date: '2026-10-30', provider_rejections: 2 }, { ...jour, date: '2026-10-31', provider_rejections: 1 }],
      acceptance: {},
      baselines: {},
      today: { spent_usd: '0', daily_budget_usd: null },
      usd_to_xof: '600',
    } });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(withIntl(<QueryClientProvider client={queryClient}><AiDashboardPanel /></QueryClientProvider>));

    expect(await screen.findByRole('status')).toHaveTextContent('3 appels ont basculé sur le maillon suivant');
    const ligne = within(screen.getByRole('table', { name: 'Appels par jour et par usage' })).getByRole('row', { name: /2026-10-30/ });
    expect(within(ligne).getAllByRole('cell').at(-1)).toHaveTextContent('2');
  });
});
