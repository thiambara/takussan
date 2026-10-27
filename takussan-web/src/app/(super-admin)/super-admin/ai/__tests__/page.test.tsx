import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fetchAdminAiProviders, fetchAdminAiRoles } from '@/lib/queries/super-admin';
import { withIntl } from '@/test/intl';
import SuperAdminAiPage from '../page';

vi.mock('@/lib/queries/super-admin', () => ({
  fetchAdminAiRoles: vi.fn(),
  putAdminAiRole: vi.fn(),
  deleteAdminAiRole: vi.fn(),
  fetchAdminAiUsages: vi.fn().mockResolvedValue({ data: [] }),
  patchAdminAiUsage: vi.fn(),
  fetchAdminAiProviders: vi.fn(),
  testAdminAiProvider: vi.fn(),
  postAdminAiEvaluation: vi.fn(),
  fetchAdminAiEvaluation: vi.fn(),
  fetchAdminAiDashboard: vi.fn().mockResolvedValue({ data: { days: [], acceptance: {}, baselines: {}, today: { spent_xof: 0, daily_budget_xof: 5000 } } }),
}));

const providers = [{ key: 'anthropic', legal_name: 'Anthropic', key_present: true, models: ['modele-a', 'modele-b'] }];

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      <SuperAdminAiPage />
    </QueryClientProvider>,
  ));
}

describe('console IA (TCK-2385)', () => {
  it('lit la chaîne d’un rôle comme un ordre de bascule', async () => {
    vi.mocked(fetchAdminAiRoles).mockResolvedValue({
      data: {
        roles: [{ role: 'extraction', source: 'config', updated_at: null, chain: [
          { provider: 'anthropic', model: 'modele-a', max_tokens: 1000 },
          { provider: 'anthropic', model: 'modele-b', max_tokens: 1000 },
        ] }],
        providers,
      },
    });
    renderPage();

    expect(await screen.findByText('1. anthropic · modele-a')).toBeInTheDocument();
    expect(screen.getByText('2. anthropic · modele-b')).toBeInTheDocument();
    expect(screen.getByText('Configuration par défaut')).toBeInTheDocument();
  });

  it('montre la présence d’une clé, jamais un champ pour la saisir', async () => {
    vi.mocked(fetchAdminAiRoles).mockResolvedValue({ data: { roles: [], providers } });
    vi.mocked(fetchAdminAiProviders).mockResolvedValue({ data: providers });
    renderPage();

    await userEvent.click(await screen.findByRole('tab', { name: 'Fournisseurs' }));

    expect(await screen.findByText('Présente')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tester la connexion' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/clé/i)).not.toBeInTheDocument();
  });
});
