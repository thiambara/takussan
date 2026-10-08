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
    expect(payload.settings).toEqual({
      default_commission_rate: 5,
      currency: 'XOF',
      timezone: 'Africa/Dakar',
      late_fee_online_collection: false,
    });
  });
});
