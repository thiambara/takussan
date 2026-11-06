import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import type { Agency } from '@/types/agency';

const ROUTEUR = vi.hoisted(() => ({ refresh: () => {}, back: () => {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ROUTEUR }));
vi.mock('@/app/actions/admin-agency', () => ({
  updateAgencyAction: vi.fn(),
  uploadAgencyLogoAction: vi.fn(),
}));
// Le formulaire lit `useCan('payouts.approve')` depuis TCK-594 (seuil des quatre yeux).
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: false, isLoading: false }) }));

import { updateAgencyAction } from '@/app/actions/admin-agency';
import { AgencyConfigForm } from '../AgencyConfigForm';

/**
 * TCK-593 (Partie 5) — le réglage « Encaisser les pénalités de retard avec le paiement en ligne ».
 *
 * Deux propriétés : le réglage se LIT (une agence sans la clé l'a désactivé — AC4 côté front) et
 * s'ENVOIE ; et l'enregistrement n'envoie que les clés de `settings` que l'écran gère. L'API
 * fusionne désormais `settings` clé par clé : renvoyer l'objet lu réécrirait des réglages que
 * l'écran ne montre pas (`watermark_enabled`…).
 */

const AGENCE: Agency = {
  id: 7,
  name: 'Dakar Immo',
  slug: 'dakar-immo',
  license_number: null,
  description: null,
  email: null,
  phone: null,
  website: null,
  commission_rate: 5,
  currency: 'XOF',
  is_verified: true,
  status: 'active',
  logo_url: null,
  settings: null,
  primary_admin_id: null,
};

const LIBELLE = fr.admin.agencyConfig.lateFeeOnline.label;

beforeEach(() => {
  vi.mocked(updateAgencyAction).mockReset();
  vi.mocked(updateAgencyAction).mockResolvedValue({ ok: true, data: AGENCE });
});

async function enregistrer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: fr.common.actions.save }));
  await waitFor(() => expect(updateAgencyAction).toHaveBeenCalledTimes(1));
  return vi.mocked(updateAgencyAction).mock.calls[0][1];
}

describe('AgencyConfigForm — pénalités de retard en ligne (TCK-593 Partie 5)', () => {
  it('une agence sans la clé a le réglage DÉSACTIVÉ', () => {
    render(withIntl(<AgencyConfigForm agency={AGENCE} />));
    expect(screen.getByRole('switch', { name: LIBELLE })).not.toBeChecked();
  });

  it('une agence qui l’a activé le voit activé', () => {
    render(withIntl(<AgencyConfigForm agency={{ ...AGENCE, settings: { late_fee_online_collection: true } }} />));
    expect(screen.getByRole('switch', { name: LIBELLE })).toBeChecked();
  });

  /**
   * Revue adverse de TCK-2486, M2 — l'API lit ce réglage par `AgencySettings::read` (`filter_var`) : un `1`
   * stocké (que `PATCH` accepte et garde tel quel) l'ACTIVE. La fiche le montrait désactivé, et depuis
   * TCK-2486 un enregistrement ne le réécrivait plus : l'agence encaissait pendant que l'écran disait non.
   */
  it.each([1, '1', 'true', 'on', 'yes'])('revue M2 — une valeur %j, vraie pour l’API, s’affiche activée et ne part pas inchangée', async (valeur) => {
    const user = userEvent.setup();
    render(withIntl(<AgencyConfigForm agency={{ ...AGENCE, settings: { late_fee_online_collection: valeur } as unknown as Agency['settings'] }} />));
    expect(screen.getByRole('switch', { name: LIBELLE })).toBeChecked();
    expect(await enregistrer(user)).not.toHaveProperty('settings');
  });

  it.each([0, '0', 'off', 'no', 'false'])('revue M2 — une valeur %j, fausse pour l’API, s’affiche désactivée', (valeur) => {
    render(withIntl(<AgencyConfigForm agency={{ ...AGENCE, settings: { late_fee_online_collection: valeur } as unknown as Agency['settings'] }} />));
    expect(screen.getByRole('switch', { name: LIBELLE })).not.toBeChecked();
  });

  it('explique les deux positions', () => {
    render(withIntl(<AgencyConfigForm agency={AGENCE} />));
    expect(screen.getByRole('switch', { name: LIBELLE })).toHaveAccessibleDescription(
      fr.admin.agencyConfig.lateFeeOnline.hint,
    );
  });

  it('activer puis enregistrer envoie le réglage à true', async () => {
    const user = userEvent.setup();
    render(withIntl(<AgencyConfigForm agency={AGENCE} />));

    await user.click(screen.getByRole('switch', { name: LIBELLE }));
    const payload = await enregistrer(user);
    expect(payload.settings).toMatchObject({ late_fee_online_collection: true });
  });

  it('n’envoie que les clés gérées : les autres réglages ne sont ni renvoyés ni vidés', async () => {
    const user = userEvent.setup();
    render(
      withIntl(
        <AgencyConfigForm
          agency={{
            ...AGENCE,
            settings: { watermark_enabled: false, welcome: { standard_unlocked_at: null }, timezone: 'Africa/Dakar' },
          }}
        />,
      ),
    );

    const payload = await enregistrer(user);
    // TCK-962 — ni `timezone`, ni les miroirs `currency` et `default_commission_rate` : l'API les
    // jette, la commission et la devise partent sur leurs colonnes.
    // TCK-2486 — aucune case touchée : pas de `settings` du tout. Une clé absente est conservée par la
    // fusion de l'API (`hidden_modules` depuis la revue de TCK-2483, M5 ; les deux booléens depuis TCK-2486).
    expect(payload).not.toHaveProperty('settings');
  });

  /**
   * TCK-2486 — l'admin B, qui avait ouvert la fiche avant que l'admin A n'active l'encaissement, enregistre
   * son nom : la valeur qu'il a chargée (`false`) ne part pas, et ne défait donc pas celle de A.
   */
  it('TCK-2486 — inchangé ne part pas ; désactiver un réglage chargé actif envoie false', async () => {
    const user = userEvent.setup();
    const { unmount } = render(withIntl(<AgencyConfigForm agency={{ ...AGENCE, settings: { late_fee_online_collection: true } }} />));
    expect((await enregistrer(user)).settings ?? {}).not.toHaveProperty('late_fee_online_collection');
    unmount();

    vi.mocked(updateAgencyAction).mockClear();
    render(withIntl(<AgencyConfigForm agency={{ ...AGENCE, settings: { late_fee_online_collection: true } }} />));
    await user.click(screen.getByRole('switch', { name: LIBELLE }));
    expect((await enregistrer(user)).settings).toEqual({ late_fee_online_collection: false });
  });
});
