import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { attendAucuneCleBrute } from '@/test/cles-brutes';
import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { IntegrationWebhookEndpoint } from '../IntegrationWebhookEndpoint';

const fetchMock = vi.fn();
const rotateMock = vi.fn();

vi.mock('@/app/actions/admin-settings', () => ({
  fetchIntegrationWebhookEndpointAction: (...args: unknown[]) => fetchMock(...args),
  rotateIntegrationWebhookEndpointAction: (...args: unknown[]) => rotateMock(...args),
}));

const URL_A = 'https://api.takussan.test/api/webhooks/payments/wave/aaaaaaaa';
const URL_B = 'https://api.takussan.test/api/webhooks/payments/wave/bbbbbbbb';

const originalClipboard = navigator.clipboard;
let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock.mockReset();
  rotateMock.mockReset();
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true, writable: true });
});

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true, writable: true });
  vi.restoreAllMocks();
});

describe('<IntegrationWebhookEndpoint /> (TCK-293)', () => {
  it('affiche l’adresse préchargée, la consigne Wave, et copie l’adresse', async () => {
    render(withIntl(<IntegrationWebhookEndpoint integrationId={7} provider="wave" initialUrl={URL_A} />));

    expect(screen.getByLabelText('Adresse de notification Wave')).toHaveValue(URL_A);
    expect(screen.getByText(/portail Wave Business/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copier' }));
    expect(await screen.findByRole('button', { name: 'Copiée' })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(URL_A);
    attendAucuneCleBrute();
  });

  it('dit qu’il n’y a rien à coller pour Orange Money', () => {
    render(withIntl(<IntegrationWebhookEndpoint integrationId={7} provider="orange_money" initialUrl={URL_A} />));
    expect(screen.getByText(/Rien à coller/)).toBeInTheDocument();
  });

  it('copie refusée par le navigateur : l’adresse est sélectionnée et la consigne s’affiche', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    render(withIntl(<IntegrationWebhookEndpoint integrationId={7} provider="wave" initialUrl={URL_A} />));

    fireEvent.click(screen.getByRole('button', { name: 'Copier' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/copiez-la à la main/);
  });

  it('sans adresse préchargée, la lit à la demande', async () => {
    fetchMock.mockResolvedValue({ ok: true, data: { integration_id: 7, provider: 'wave', url: URL_A } });
    render(withIntl(<IntegrationWebhookEndpoint integrationId={7} provider="wave" />));

    fireEvent.click(screen.getByRole('button', { name: "Afficher l'adresse" }));
    expect(await screen.findByLabelText('Adresse de notification Wave')).toHaveValue(URL_A);
    expect(fetchMock).toHaveBeenCalledWith(7);
  });

  it('régénérer demande confirmation ; refusée, rien n’est appelé', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(withIntl(<IntegrationWebhookEndpoint integrationId={7} provider="wave" initialUrl={URL_A} />));

    fireEvent.click(screen.getByRole('button', { name: 'Régénérer' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/cessera de fonctionner/));
    expect(rotateMock).not.toHaveBeenCalled();
  });

  it('régénérer remplace l’adresse et dit que l’ancienne ne fonctionne plus', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    rotateMock.mockResolvedValue({ ok: true, data: { integration_id: 7, provider: 'wave', url: URL_B } });
    render(withIntl(<IntegrationWebhookEndpoint integrationId={7} provider="wave" initialUrl={URL_A} />));

    fireEvent.click(screen.getByRole('button', { name: 'Régénérer' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/ancienne ne fonctionne plus/);
    expect(screen.getByLabelText('Adresse de notification Wave')).toHaveValue(URL_B);
    expect(rotateMock).toHaveBeenCalledWith(7);
  });

  it('un refus de second facteur passe par la garde, puis le geste est rejoué', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    rotateMock
      .mockResolvedValueOnce({ ok: false, status: 403, message: 'second facteur', code: 'two_factor_step_up_required' })
      .mockResolvedValueOnce({ ok: true, data: { integration_id: 7, provider: 'wave', url: URL_B } });
    const garde = vi.fn().mockResolvedValue(true);
    render(
      withIntl(
        <ContexteGardeDoubleFacteur.Provider value={garde}>
          <IntegrationWebhookEndpoint integrationId={7} provider="wave" initialUrl={URL_A} />
        </ContexteGardeDoubleFacteur.Provider>,
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Régénérer' }));
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
    expect(rotateMock).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Adresse de notification Wave')).toHaveValue(URL_B);
  });

  it('un échec garde l’adresse affichée et montre le message', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    rotateMock.mockResolvedValue({ ok: false, status: 403, message: 'Accès refusé.' });
    render(withIntl(<IntegrationWebhookEndpoint integrationId={7} provider="wave" initialUrl={URL_A} />));

    fireEvent.click(screen.getByRole('button', { name: 'Régénérer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Accès refusé.');
    expect(screen.getByLabelText('Adresse de notification Wave')).toHaveValue(URL_A);
  });
});
