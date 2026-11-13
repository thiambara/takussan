/**
 * Les autres voies (TCK-2604) — seul départ chez un fournisseur depuis TCK-2606, qui a retiré
 * `OAuthButtons` avec son dernier appelant. Ces tests reprennent ceux d'`OAuthButtons` (TCK-589) :
 * seuls les fournisseurs configurés paraissent, et l'intention est posée AVANT de quitter la page.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

import { AutresVoies } from '../AutresVoies';
import { CLE_INTENTION_OAUTH } from '../intention-oauth';

const oauthProvidersMock = vi.fn();
const oauthRedirectMock = vi.fn();
const assignMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  oauthProviders: () => oauthProvidersMock(),
  oauthRedirect: (provider: string) => oauthRedirectMock(provider),
}));

const GOOGLE_SEUL = [
  { provider: 'google', configured: true, missing: [] },
  { provider: 'facebook', configured: false, missing: ['client_id'] },
  { provider: 'apple', configured: false, missing: ['client_id'] },
];

beforeEach(() => {
  oauthProvidersMock.mockReset();
  oauthRedirectMock.mockReset();
  assignMock.mockReset();
  window.sessionStorage.clear();
  Object.defineProperty(window, 'location', { configurable: true, value: { assign: assignMock } });
});

describe('AutresVoies', () => {
  it('ne rend que les fournisseurs que l’API dit configurés', async () => {
    oauthProvidersMock.mockResolvedValue(GOOGLE_SEUL);
    render(withIntl(<AutresVoies redirect={null} onEmail={() => undefined} />));

    expect(await screen.findByRole('button', { name: /Google/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Facebook/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Apple/ })).toBeNull();
  });

  // TCK-589 — le rappel du fournisseur ne transporte pas `redirect` : l'intention doit être posée
  // dans l'onglet AVANT de partir, pas après.
  it.each([
    ['/properties/x?action=reserver', '/properties/x?action=reserver'],
    ['//evil.example', null],
  ])('redirect %s → mémorisé %s avant de quitter la page', async (redirect, attendu) => {
    const user = userEvent.setup();
    oauthProvidersMock.mockResolvedValue(GOOGLE_SEUL);
    oauthRedirectMock.mockResolvedValue({ redirect_url: 'https://accounts.google.com/oauth' });
    let auDepart: string | null | undefined;
    assignMock.mockImplementation(() => {
      auDepart = window.sessionStorage.getItem(CLE_INTENTION_OAUTH);
    });

    render(withIntl(<AutresVoies redirect={redirect} onEmail={() => undefined} />));
    await user.click(await screen.findByRole('button', { name: /Google/ }));

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith('https://accounts.google.com/oauth'));
    expect(oauthRedirectMock).toHaveBeenCalledWith('google');
    expect(auDepart).toBe(attendu);
  });

  it('un départ refusé se dit, et le bouton revient', async () => {
    const user = userEvent.setup();
    oauthProvidersMock.mockResolvedValue(GOOGLE_SEUL);
    oauthRedirectMock.mockRejectedValue(new Error('réseau'));

    render(withIntl(<AutresVoies redirect={null} onEmail={() => undefined} />));
    await user.click(await screen.findByRole('button', { name: /Google/ }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(assignMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Google/ })).toBeEnabled();
  });

  // TCK-2606 — sous la voie e-mail (numéro fermé), il n'y a pas de bouton e-mail à proposer.
  it('sans voie e-mail : le fournisseur seul, sans bouton « e-mail »', async () => {
    oauthProvidersMock.mockResolvedValue(GOOGLE_SEUL);
    render(withIntl(<AutresVoies redirect={null} />));

    expect(await screen.findByRole('button', { name: /Google/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /e-mail/ })).toBeNull();
  });

  it('sans voie e-mail ni fournisseur : rien, pas un « ou » orphelin', async () => {
    oauthProvidersMock.mockResolvedValue([]);
    const { container } = render(withIntl(<AutresVoies redirect={null} />));

    await waitFor(() => expect(oauthProvidersMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
