import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { patchPlatformSettings } from '@/lib/queries/super-admin';
import type { PlatformSetting } from '@/types/super-admin';
import { withIntl } from '@/test/intl';
import { SettingsSection } from '../platform-settings';

vi.mock('@/lib/queries/super-admin', () => ({
  patchPlatformSettings: vi.fn(),
}));

function renderSection(settings: PlatformSetting[], title = 'Limites techniques') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(withIntl(
    <QueryClientProvider client={queryClient}>
      <SettingsSection title={title} settings={settings} />
    </QueryClientProvider>,
  ));
}

const sessionSetting: PlatformSetting = {
  key: 'platform.session_max_minutes',
  category: 'limits',
  type: 'integer',
  value: 480,
  default_value: 480,
  options: null,
  public: false,
  requires_restart: true,
  updated_at: null,
  updated_by: null,
};

const supportedSetting: PlatformSetting = {
  key: 'currency.supported',
  category: 'currency',
  type: 'multi_select',
  value: ['XOF', 'EUR'],
  default_value: ['XOF', 'EUR', 'USD'],
  options: ['XOF', 'EUR', 'USD'],
  public: true,
  requires_restart: false,
  updated_at: null,
  updated_by: null,
};

describe('<SettingsSection>', () => {
  it('translates the label and description from the key (TCK-600 — the API serves none)', () => {
    renderSection([sessionSetting]);

    expect(screen.getByLabelText('Durée maximale d’une session opérateur')).toBeInTheDocument();
    expect(screen.getByText(/de 15 à 1440/)).toBeInTheDocument();
  });

  it('saves section changes as a bulk patch', async () => {
    vi.mocked(patchPlatformSettings).mockResolvedValue({ data: { limits: [sessionSetting] } });
    const user = userEvent.setup();
    renderSection([sessionSetting]);

    const champ = screen.getByLabelText(/Durée maximale/i);
    await user.clear(champ);
    await user.type(champ, '240');
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(patchPlatformSettings).toHaveBeenCalledWith({
      'platform.session_max_minutes': '240',
    }));
  });

  it('keeps XOF among the supported currencies', async () => {
    const user = userEvent.setup();
    renderSection([{ ...supportedSetting, value: ['EUR'] }], 'Devises');

    expect(screen.getByText(/XOF doit rester/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enregistrer/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'XOF' }));
    expect(screen.queryByText(/XOF doit rester/i)).not.toBeInTheDocument();
  });
});
