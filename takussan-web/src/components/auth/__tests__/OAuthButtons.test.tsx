import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OAuthButtons } from '../OAuthButtons';

const oauthProvidersMock = vi.fn();
const oauthRedirectMock = vi.fn();
const assignMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  oauthProviders: () => oauthProvidersMock(),
  oauthRedirect: (provider: string) => oauthRedirectMock(provider),
}));

describe('OAuthButtons', () => {
  beforeEach(() => {
    oauthProvidersMock.mockReset();
    oauthRedirectMock.mockReset();
    assignMock.mockReset();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign: assignMock },
    });
  });

  it('renders only providers configured by the API', async () => {
    oauthProvidersMock.mockResolvedValue([
      { provider: 'google', configured: true, missing: [] },
      { provider: 'facebook', configured: false, missing: ['client_id'] },
      { provider: 'apple', configured: false, missing: ['client_id'] },
    ]);

    render(<OAuthButtons />);

    expect(screen.getByText('Chargement des fournisseurs…')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Continuer avec Google' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continuer avec Facebook' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continuer avec Apple' })).not.toBeInTheDocument();
  });

  it('keeps the existing redirect behavior for configured Google', async () => {
    const user = userEvent.setup();
    oauthProvidersMock.mockResolvedValue([
      { provider: 'google', configured: true, missing: [] },
      { provider: 'facebook', configured: false, missing: ['client_id'] },
      { provider: 'apple', configured: false, missing: ['client_id'] },
    ]);
    oauthRedirectMock.mockResolvedValue({ redirect_url: 'https://accounts.google.com/oauth' });

    render(<OAuthButtons />);

    await user.click(await screen.findByRole('button', { name: 'Continuer avec Google' }));

    await waitFor(() => {
      expect(oauthRedirectMock).toHaveBeenCalledWith('google');
      expect(assignMock).toHaveBeenCalledWith('https://accounts.google.com/oauth');
    });
  });
});
