import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { withIntl } from '@/test/intl';
import { IntegrationsManager } from '../IntegrationsManager';

/**
 * TCK-761 (P15.04) — créer, modifier, tester ou supprimer une intégration exige la 2FA de l'admin
 * (`IntegrationController@store|update|test|destroy`). Les actions serveur rendent le `code` du
 * refus depuis TCK-293, mais l'écran ne le confiait pas à la garde : il affichait le message.
 */
const actions = vi.hoisted(() => ({
  createIntegrationAction: vi.fn(),
  updateIntegrationAction: vi.fn(),
  testIntegrationAction: vi.fn(),
  deleteIntegrationAction: vi.fn(),
  fetchIntegrationWebhookEndpointAction: vi.fn(),
  rotateIntegrationWebhookEndpointAction: vi.fn(),
}));
vi.mock('@/app/actions/admin-settings', () => actions);

const wave = {
  id: 42,
  provider: 'wave',
  agency_id: 1,
  is_active: true,
  last_used_at: null,
  metadata: null,
  created_at: null,
  updated_at: null,
};

const REFUS = { ok: false, status: 403, message: 'Second facteur requis.', code: 'two_factor_step_up_required' } as const;

function monter(garde: ReturnType<typeof vi.fn>) {
  render(
    withIntl(
      <ContexteGardeDoubleFacteur.Provider value={garde}>
        <IntegrationsManager initialIntegrations={[wave]} />
      </ContexteGardeDoubleFacteur.Provider>,
    ),
  );
}

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
});

describe('<IntegrationsManager> — second facteur', () => {
  it('le test de connexion : la garde s’ouvre, puis le test est rejoué', async () => {
    actions.testIntegrationAction
      .mockResolvedValueOnce(REFUS)
      .mockResolvedValueOnce({ ok: true, data: { ok: true, message: 'Connexion réussie', last_used_at: null } });
    const garde = vi.fn().mockResolvedValue(true);
    monter(garde);

    await userEvent.setup().click(screen.getByRole('button', { name: /Tester la connexion/ }));

    await waitFor(() => expect(screen.getByText('Connexion réussie')).toBeInTheDocument());
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
    expect(actions.testIntegrationAction).toHaveBeenCalledTimes(2);
  });

  it('l’activation : la garde s’ouvre, puis la bascule est rejouée', async () => {
    actions.updateIntegrationAction
      .mockResolvedValueOnce(REFUS)
      .mockResolvedValueOnce({ ok: true, data: { ...wave, is_active: false } });
    const garde = vi.fn().mockResolvedValue(true);
    monter(garde);

    await userEvent.setup().click(screen.getByRole('button', { name: /Désactiver/ }));

    await waitFor(() => expect(actions.updateIntegrationAction).toHaveBeenCalledTimes(2));
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
  });

  it('la suppression : la garde s’ouvre, puis la suppression est rejouée', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    actions.deleteIntegrationAction.mockResolvedValueOnce(REFUS).mockResolvedValueOnce({ ok: true });
    const garde = vi.fn().mockResolvedValue(true);
    monter(garde);

    await userEvent.setup().click(screen.getByRole('button', { name: /Supprimer/ }));

    await waitFor(() => expect(actions.deleteIntegrationAction).toHaveBeenCalledTimes(2));
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
  });

  it('la création : la garde s’ouvre, puis la création est rejouée', async () => {
    actions.createIntegrationAction
      .mockResolvedValueOnce(REFUS)
      .mockResolvedValueOnce({ ok: true, data: { ...wave, id: 99, provider: 'sms_orange' } });
    const garde = vi.fn().mockResolvedValue(true);
    monter(garde);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Ajouter une intégration/ }));
    const fournisseur = await screen.findByLabelText(/Fournisseur/);
    await user.clear(fournisseur);
    await user.type(fournisseur, 'sms_orange');
    await user.type(screen.getByLabelText('Client ID'), 'cid-123');
    await user.type(screen.getByLabelText('Client secret'), 'csec-456');
    await user.type(screen.getByLabelText(/Sender address/), 'tel:+221771234567');
    await user.type(screen.getByLabelText(/Sender name/), 'TAKUSSAN');
    await user.click(screen.getByRole('button', { name: /Ajouter$/ }));

    await waitFor(() => expect(actions.createIntegrationAction).toHaveBeenCalledTimes(2));
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
  });

  it('sans garde (hors de la coque) : le refus s’affiche comme avant, sans rejeu', async () => {
    actions.testIntegrationAction.mockResolvedValue(REFUS);
    render(withIntl(<IntegrationsManager initialIntegrations={[wave]} />));

    await userEvent.setup().click(screen.getByRole('button', { name: /Tester la connexion/ }));

    await waitFor(() => expect(screen.getByText('Second facteur requis.')).toBeInTheDocument());
    expect(actions.testIntegrationAction).toHaveBeenCalledTimes(1);
  });
});
