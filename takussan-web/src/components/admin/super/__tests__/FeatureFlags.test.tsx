import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { overrideAdminFeatureFlag, patchAdminFeatureFlag } from '@/lib/queries/super-admin';
import type { AdminFeatureFlag } from '@/types/super-admin';
import { FeatureFlagTable } from '../feature-flags';
import { withIntl } from '@/test/intl';

vi.mock('@/lib/queries/super-admin', () => ({
  overrideAdminFeatureFlag: vi.fn(),
  patchAdminFeatureFlag: vi.fn(),
}));

const flag: AdminFeatureFlag = {
  key: 'property_compare',
  label: 'Comparateur de biens',
  description: 'Active le comparateur',
  client_visible: true,
  enabled: false,
  segments: {},
  updated_at: null,
};

function renderTable() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      <FeatureFlagTable flags={[flag]} />
    </QueryClientProvider>,
  ));
}

describe('<FeatureFlagTable>', () => {
  it('updates segments and enables a flag', async () => {
    vi.mocked(patchAdminFeatureFlag).mockResolvedValue({ data: [{ ...flag, enabled: true }] });
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole('button', { name: /configurer/i }));
    await user.click(screen.getByRole('button', { name: /désactivé globalement/i }));
    await user.type(screen.getByLabelText(/Rôles ciblés/i), 'agency_admin');
    await user.clear(screen.getByLabelText(/Rollout/i));
    await user.type(screen.getByLabelText(/Rollout/i), '25');
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(patchAdminFeatureFlag).toHaveBeenCalledWith('property_compare', {
      enabled: true,
      segments: { roles: ['agency_admin'], rollout_percentage: 25 },
    }));
  });

  it('toggles a session override', async () => {
    vi.mocked(overrideAdminFeatureFlag).mockResolvedValue({ data: { key: 'property_compare', enabled: true } });
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole('button', { name: /^tester$/i }));

    expect(await screen.findByRole('button', { name: /vous testez/i })).toBeInTheDocument();
  });
});
