import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import type { Integration, PaymentProviderSchema } from '@/types/setting';
import { IntegrationsManager } from '../IntegrationsManager';

vi.mock('@/app/actions/admin-settings', () => ({
  createIntegrationAction: vi.fn(),
  updateIntegrationAction: vi.fn(),
  testIntegrationAction: vi.fn(),
  deleteIntegrationAction: vi.fn(),
  fetchIntegrationWebhookEndpointAction: vi.fn().mockResolvedValue({ ok: true, data: { url: null } }),
  rotateIntegrationWebhookEndpointAction: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * TCK-2676 — les intégrations en français : ni « Client ID », ni « Client secret », ni « Sender »,
 * ni la valeur d'API d'un fournisseur (`orange_money`) dans ce que lit le gérant.
 *
 * Le schéma porte les libellés ANGLAIS que l'API publie (`OrangeMoneyProvider::schema()`) : l'écran
 * ne doit pas les reprendre — il résout chaque champ par son nom sous `paymentFields.*`.
 */
const ORANGE_MONEY: PaymentProviderSchema = {
  key: 'orange_money',
  label: 'Orange Money',
  fields: [
    { name: 'client_id', label: 'Client ID', type: 'text', secret: false, required: true },
    { name: 'client_secret', label: 'Client secret', type: 'password', secret: true, required: true },
    { name: 'merchant_key', label: 'Merchant key', type: 'text', secret: false, required: true },
    { name: 'webhook_secret', label: 'Webhook secret', type: 'password', secret: true, required: true },
  ] as unknown as PaymentProviderSchema['fields'],
};

function integration(provider: string, extra: Partial<Integration> = {}): Integration {
  return {
    id: 7,
    provider,
    agency_id: 1,
    is_active: true,
    last_used_at: null,
    metadata: null,
    created_at: null,
    updated_at: null,
    ...extra,
  } as Integration;
}

/** Les mots anglais que l'audit a relevés dans les dialogues (06-agence.md § 11). */
const ANGLAIS = /Client ID|Client secret|Sender|Username|Password|Account ID|Service ID|LAMPUSH|override|whitelist|Providers/i;

describe('<IntegrationsManager> — des mots et non des codes (TCK-2676)', () => {
  it('AC3 — le dialogue « Orange Money » ne montre ni « Client ID », ni « Client secret », ni « Sender »', async () => {
    const user = userEvent.setup();
    render(
      withIntl(
        <IntegrationsManager initialIntegrations={[integration('orange_money')]} paymentProviders={[ORANGE_MONEY]} />,
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Configurer' }));
    const dialogue = await screen.findByRole('dialog');
    const texte = dialogue.textContent ?? '';

    expect(texte).toContain('Configurer Orange Money');
    expect(texte).not.toMatch(ANGLAIS);
    expect(texte).not.toContain('orange_money');
    expect(within(dialogue).getByLabelText('Identifiant client')).toBeInTheDocument();
    expect(within(dialogue).getByLabelText('Secret client')).toBeInTheDocument();
  });

  it.each(['sms_orange', 'sms_mtarget', 'sms_lafricamobile'])(
    'le dialogue SMS %s parle français',
    async (provider) => {
      const user = userEvent.setup();
      render(withIntl(<IntegrationsManager initialIntegrations={[]} />));

      await user.click(screen.getByRole('button', { name: /Ajouter une intégration/ }));
      fireEvent.change(await screen.findByLabelText(/Fournisseur/), { target: { value: provider } });
      const dialogue = screen.getByRole('dialog');

      // Les libellés des champs — l'avertissement ARTP garde ses sigles (2FA, OTP), hors sujet ici.
      const libelles = within(dialogue).getAllByText((_, el) => el?.tagName === 'LABEL')
        .map((el) => el.textContent ?? '');
      expect(libelles.filter((l) => ANGLAIS.test(l))).toEqual([]);
      expect(within(dialogue).getAllByText(/Nom d'expéditeur/).length).toBeGreaterThan(0);
    },
  );

  it('la carte : date sans les secondes, nom du fournisseur, suppression libellée', () => {
    render(
      withIntl(
        <IntegrationsManager
          initialIntegrations={[integration('orange_money', { last_used_at: '2026-10-31T23:59:59Z' })]}
          paymentProviders={[ORANGE_MONEY]}
        />,
      ),
    );

    const carte = screen.getByRole('heading', { name: 'Orange Money' }).closest('article') as HTMLElement;
    // Le format commun (`formatDateTime`), plus « 31/10/2026 23:59:59 ».
    expect(carte.textContent).toContain('31 oct. 2026, 23:59');
    expect(carte.textContent).not.toContain('23:59:59');

    const supprimer = within(carte).getByRole('button', { name: 'Supprimer Orange Money' });
    expect(supprimer).toHaveTextContent('Supprimer');
  });

  it('la confirmation de suppression nomme le fournisseur, pas sa valeur d’API', async () => {
    const confirmer = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(withIntl(<IntegrationsManager initialIntegrations={[integration('orange_money')]} />));

    await userEvent.setup().click(screen.getByRole('button', { name: /Supprimer/ }));
    expect(confirmer).toHaveBeenCalledWith(expect.stringContaining('« Orange Money »'));
  });
});
