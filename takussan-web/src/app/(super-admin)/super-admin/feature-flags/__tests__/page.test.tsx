import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fetchAdminFeatureFlags } from '@/lib/queries/super-admin';
import { withIntl } from '@/test/intl';
import SuperAdminFeatureFlagsPage from '../page';

vi.mock('@/lib/queries/super-admin', () => ({
  fetchAdminFeatureFlags: vi.fn(),
  overrideAdminFeatureFlag: vi.fn(),
  patchAdminFeatureFlag: vi.fn(),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      <SuperAdminFeatureFlagsPage />
    </QueryClientProvider>,
  ));
}

describe('page des drapeaux (TCK-600)', () => {
  it('dit que le catalogue est vide au lieu de rendre une table sans ligne', async () => {
    vi.mocked(fetchAdminFeatureFlags).mockResolvedValue({ data: [] });
    renderPage();

    expect(await screen.findByText('Aucun drapeau en service')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('rend la table dès qu’un drapeau est servi', async () => {
    vi.mocked(fetchAdminFeatureFlags).mockResolvedValue({
      data: [{ key: 'carte_interactive', client_visible: true, enabled: false, segments: {}, updated_at: null }],
    });
    renderPage();

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'carte_interactive' })).toBeInTheDocument();
    expect(screen.queryByText('Aucun drapeau en service')).not.toBeInTheDocument();
  });
});
