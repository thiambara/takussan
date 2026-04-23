import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

describe('<IntegrationsManager />', () => {
  it('renders the integration card with provider + status', () => {
    render(<IntegrationsManager initialIntegrations={initial} />);
    expect(screen.getByText(/wave/i)).toBeInTheDocument();
    expect(screen.getByText(/Active/)).toBeInTheDocument();
  });

  it('runs the test action and shows a success message', async () => {
    testMock.mockResolvedValue({
      ok: true,
      data: { ok: true, message: 'Connexion vérifiée.' },
    });
    const user = userEvent.setup();
    render(<IntegrationsManager initialIntegrations={initial} />);

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
    render(<IntegrationsManager initialIntegrations={initial} />);

    await user.click(screen.getByRole('button', { name: /Tester la connexion/ }));
    expect(await screen.findByText('Clé API invalide.')).toBeInTheDocument();
  });

  it('masks the secret input until the reveal toggle is pressed', async () => {
    const user = userEvent.setup();
    render(<IntegrationsManager initialIntegrations={[]} />);

    await user.click(screen.getByRole('button', { name: /Ajouter une intégration/ }));
    const secret = await screen.findByLabelText('Secret');
    expect(secret).toHaveAttribute('type', 'password');

    // "Afficher" toggle flips the input to text.
    await user.click(screen.getAllByRole('button', { name: 'Afficher' })[1]);
    expect(secret).toHaveAttribute('type', 'text');
  });
});
