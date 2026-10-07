import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import type { Agency } from '@/types/agency';

const ROUTEUR = vi.hoisted(() => ({ refresh: () => {}, back: () => {} }));
const updateAgencyAction = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ROUTEUR }));
vi.mock('@/app/actions/admin-agency', () => ({
  updateAgencyAction,
  uploadAgencyLogoAction: vi.fn(),
}));

import { AgencyConfigForm } from '../AgencyConfigForm';

/** TCK-589 — « 2FA obligatoire pour toute l'équipe », dans les réglages existants de l'agence. */
const agence = (settings: Agency['settings']): Agency => ({
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
  settings,
  primary_admin_id: null,
});

const libelle = 'Double authentification obligatoire pour toute l’équipe';

describe('AgencyConfigForm — 2FA obligatoire pour l’équipe', () => {
  it('reflète le réglage enregistré', () => {
    render(withIntl(<AgencyConfigForm agency={agence({ require_team_two_factor: true })} />));
    expect(screen.getByRole('checkbox', { name: libelle })).toBeChecked();
  });

  it('cocher puis enregistrer envoie `settings.require_team_two_factor: true`', async () => {
    const user = userEvent.setup();
    updateAgencyAction.mockResolvedValue({ ok: true, data: agence({ require_team_two_factor: true }) });
    render(withIntl(<AgencyConfigForm agency={agence(null)} />));

    const caseACocher = screen.getByRole('checkbox', { name: libelle });
    expect(caseACocher).not.toBeChecked();
    await user.click(caseACocher);
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(updateAgencyAction).toHaveBeenCalledTimes(1));
    expect(updateAgencyAction.mock.calls[0]![1]).toMatchObject({
      settings: expect.objectContaining({ require_team_two_factor: true }),
    });
  });
});
