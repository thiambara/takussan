import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { patchPlatformSettings } from '@/lib/queries/super-admin';
import type { PlatformSetting } from '@/types/super-admin';
import { SettingsSection } from '../platform-settings';

vi.mock('@/lib/queries/super-admin', () => ({
  patchPlatformSettings: vi.fn(),
}));

function renderSection(settings: PlatformSetting[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsSection title="Frais plateforme" settings={settings} />
    </QueryClientProvider>,
  );
}

const feeSetting: PlatformSetting = {
  key: 'transaction.platform_fee_booking',
  category: 'transaction',
  label: 'Frais plateforme réservations',
  description: 'Pourcentage prélevé.',
  type: 'percentage',
  value: 5,
  default_value: 0,
  options: null,
  public: false,
  requires_restart: false,
  updated_at: null,
  updated_by: null,
};

describe('<SettingsSection>', () => {
  it('saves section changes as a bulk patch', async () => {
    vi.mocked(patchPlatformSettings).mockResolvedValue({ data: { transaction: [feeSetting] } });
    const user = userEvent.setup();
    renderSection([feeSetting]);

    await user.clear(screen.getByLabelText(/Frais plateforme réservations/i));
    await user.type(screen.getByLabelText(/Frais plateforme réservations/i), '7.25');
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(patchPlatformSettings).toHaveBeenCalledWith({
      'transaction.platform_fee_booking': '7.25',
    }));
  });

  it('blocks platform fees outside the accepted range before submit', async () => {
    const user = userEvent.setup();
    renderSection([feeSetting]);

    await user.clear(screen.getByLabelText(/Frais plateforme réservations/i));
    await user.type(screen.getByLabelText(/Frais plateforme réservations/i), '120');

    expect(screen.getByText(/entre 0,00 et 100,00/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enregistrer/i })).toBeDisabled();
  });
});
