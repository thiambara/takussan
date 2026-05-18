import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import { IntegrationsManager } from '../IntegrationsManager';

const createMock = vi.fn();
const updateMock = vi.fn();
const testMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('@/app/actions/admin-settings', () => ({
  createIntegrationAction: (...args: unknown[]) => createMock(...args),
  updateIntegrationAction: (...args: unknown[]) => updateMock(...args),
  testIntegrationAction: (...args: unknown[]) => testMock(...args),
  deleteIntegrationAction: (...args: unknown[]) => deleteMock(...args),
}));

const initial = [
  {
    id: 42,
    provider: 'wave',
    agency_id: 1,
    is_active: true,
    last_used_at: null,
    metadata: null,
    created_at: null,
    updated_at: null,
  },
];

beforeEach(() => {
  createMock.mockReset();
  updateMock.mockReset();
  testMock.mockReset();
  deleteMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="fr" messages={{ common: { actions: { close: 'Fermer' } } }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe('<IntegrationsManager />', () => {
  it('renders the integration card with provider + status', () => {
    renderWithIntl(<IntegrationsManager initialIntegrations={initial} />);
    expect(screen.getByText(/wave/i)).toBeInTheDocument();
    expect(screen.getByText(/Active/)).toBeInTheDocument();
  });

  it('runs the test action and shows a success message', async () => {
    testMock.mockResolvedValue({
      ok: true,
      data: { ok: true, message: 'Connexion vérifiée.' },
    });
    const user = userEvent.setup();
    renderWithIntl(<IntegrationsManager initialIntegrations={initial} />);

    await user.click(screen.getByRole('button', { name: /Tester la connexion/ }));
    expect(testMock).toHaveBeenCalledWith(42);
    expect(await screen.findByText('Connexion vérifiée.')).toBeInTheDocument();
  });

  it('surfaces the backend failure message when the test fails', async () => {
    testMock.mockResolvedValue({
      ok: true,
      data: { ok: false, message: 'Clé API invalide.' },
    });
    const user = userEvent.setup();
    renderWithIntl(<IntegrationsManager initialIntegrations={initial} />);

    await user.click(screen.getByRole('button', { name: /Tester la connexion/ }));
    expect(await screen.findByText('Clé API invalide.')).toBeInTheDocument();
  });

  it('masks the secret input until the reveal toggle is pressed', async () => {
    const user = userEvent.setup();
    renderWithIntl(<IntegrationsManager initialIntegrations={[]} />);

    await user.click(screen.getByRole('button', { name: /Ajouter une intégration/ }));
    const secret = await screen.findByLabelText('Secret');
    expect(secret).toHaveAttribute('type', 'password');

    // "Afficher" toggle flips the input to text.
    await user.click(screen.getAllByRole('button', { name: 'Afficher' })[1]);
    expect(secret).toHaveAttribute('type', 'text');
  });

  it('renders Orange SMS specific fields when provider = sms_orange (TCK-102)', async () => {
    const user = userEvent.setup();
    renderWithIntl(<IntegrationsManager initialIntegrations={[]} />);

    await user.click(screen.getByRole('button', { name: /Ajouter une intégration/ }));
    const providerInput = await screen.findByLabelText(/Fournisseur/);
    await user.clear(providerInput);
    await user.type(providerInput, 'sms_orange');

    expect(screen.getByLabelText('Client ID')).toBeInTheDocument();
    expect(screen.getByLabelText('Client secret')).toBeInTheDocument();
    expect(screen.getByLabelText(/Sender address/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Sender name/)).toBeInTheDocument();
    // ARTP banner present.
    expect(screen.getByText(/Conformité ARTP/i)).toBeInTheDocument();
    // Generic "Clé API" / "Secret" fields are hidden.
    expect(screen.queryByLabelText('Clé API')).not.toBeInTheDocument();
  });

  it('renders LAfricaMobile specific fields when provider = sms_lafricamobile (TCK-102)', async () => {
    const user = userEvent.setup();
    renderWithIntl(<IntegrationsManager initialIntegrations={[]} />);

    await user.click(screen.getByRole('button', { name: /Ajouter une intégration/ }));
    const providerInput = await screen.findByLabelText(/Fournisseur/);
    await user.clear(providerInput);
    await user.type(providerInput, 'sms_lafricamobile');

    expect(screen.getByLabelText('Account ID')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText(/Sender ID/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Host LAMPUSH/)).toBeInTheDocument();
  });

  it('submits Orange credentials in the right shape (TCK-102)', async () => {
    createMock.mockResolvedValue({ ok: true, data: { id: 99, provider: 'sms_orange' } });
    const user = userEvent.setup();
    renderWithIntl(<IntegrationsManager initialIntegrations={[]} />);

    await user.click(screen.getByRole('button', { name: /Ajouter une intégration/ }));
    const providerInput = await screen.findByLabelText(/Fournisseur/);
    await user.clear(providerInput);
    await user.type(providerInput, 'sms_orange');
    await user.type(screen.getByLabelText('Client ID'), 'cid-123');
    await user.type(screen.getByLabelText('Client secret'), 'csec-456');
    await user.type(screen.getByLabelText(/Sender address/), 'tel:+221771234567');
    await user.type(screen.getByLabelText(/Sender name/), 'TAKUSSAN');
    await user.click(screen.getByRole('button', { name: /Ajouter$/ }));

    expect(createMock).toHaveBeenCalledTimes(1);
    const payload = createMock.mock.calls[0][0];
    expect(payload).toMatchObject({
      provider: 'sms_orange',
      is_active: true,
      credentials: { client_id: 'cid-123', client_secret: 'csec-456' },
      metadata: { sender_address: 'tel:+221771234567', sender_name: 'TAKUSSAN' },
    });
    // Generic credentials must not leak.
    expect(payload.credentials).not.toHaveProperty('api_key');
  });
});
