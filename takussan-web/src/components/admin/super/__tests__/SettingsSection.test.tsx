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
  nullable: false,
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
  nullable: false,
  public: true,
  requires_restart: false,
  updated_at: null,
  updated_by: null,
};

// TCK-651 (ADR-0065) — les trois types de champ des réglages métier `rentals`.
const rental = (key: string, type: PlatformSetting['type'], value: PlatformSetting['value'], nullable = false): PlatformSetting => ({
  key,
  category: 'rentals',
  type,
  value,
  default_value: value,
  options: null,
  nullable,
  public: false,
  requires_restart: false,
  updated_at: null,
  updated_by: null,
});
const capSetting = rental('late_fees.cap_percent', 'decimal', 5, true);
const signatureSetting = rental('lease.require_signature', 'boolean', false);
const offsetsSetting = rental('invoice.reminder_offsets_days', 'integer_list', [3, 7, 15]);

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

  it('sends an emptied late fee cap as null — no cap, not zero (TCK-651)', async () => {
    vi.mocked(patchPlatformSettings).mockResolvedValue({ data: { rentals: [{ ...capSetting, value: null }] } });
    const user = userEvent.setup();
    renderSection([capSetting], 'Location');

    const champ = screen.getByLabelText('Plafond des pénalités de retard');
    await user.clear(champ);
    expect(champ).toHaveAttribute('placeholder', 'Aucun plafond');
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(patchPlatformSettings).toHaveBeenCalledWith({ 'late_fees.cap_percent': null }));
  });

  it('toggles a boolean setting (TCK-651)', async () => {
    vi.mocked(patchPlatformSettings).mockResolvedValue({ data: { rentals: [{ ...signatureSetting, value: true }] } });
    const user = userEvent.setup();
    renderSection([signatureSetting], 'Location');

    const bascule = screen.getByRole('switch', { name: 'Signature exigée au renouvellement' });
    expect(bascule).not.toBeChecked();
    await user.click(bascule);
    expect(screen.getByText('Activé')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(patchPlatformSettings).toHaveBeenCalledWith({ 'lease.require_signature': true }));
  });

  it('reads reminder days as a list of integers and refuses anything else (TCK-651)', async () => {
    vi.mocked(patchPlatformSettings).mockResolvedValue({ data: { rentals: [{ ...offsetsSetting, value: [5, 10] }] } });
    const user = userEvent.setup();
    renderSection([offsetsSetting], 'Location');

    const champ = screen.getByLabelText('Relances de facture impayée');
    expect(champ).toHaveValue('3, 7, 15');

    await user.clear(champ);
    expect(screen.getByText(/au moins un nombre entier/i)).toBeInTheDocument();
    await user.type(champ, '5, dix');
    expect(screen.getByText(/au moins un nombre entier/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enregistrer/i })).toBeDisabled();

    await user.clear(champ);
    await user.type(champ, '5, 10');
    expect(screen.queryByText(/au moins un nombre entier/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(patchPlatformSettings).toHaveBeenCalledWith({ 'invoice.reminder_offsets_days': [5, 10] }));
  });
});
