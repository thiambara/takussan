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

import { updateAgencyAction } from '@/app/actions/admin-agency';
import { AgencyConfigForm } from '../AgencyConfigForm';

/**
 * TCK-597 (§8, AC14) — la case « Modération obligatoire » relit la valeur RENDUE par l'API.
 *
 * Avant : `AgencyUpdateRequest` ne validait pas `moderation_required`, la valeur était jetée en
 * silence, et l'écran disait « Modifications enregistrées. » avec la case cochée — un refus
 * silencieux déguisé en succès. L'API la persiste désormais ; si elle ne le faisait plus, l'écran
 * le dirait au lieu de mentir.
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
  moderation_required: false,
};

const LIBELLE = fr.admin.agencyConfig.moderation.label;

beforeEach(() => {
  vi.mocked(updateAgencyAction).mockReset();
});

async function cocherEtEnregistrer() {
  const user = userEvent.setup();
  render(withIntl(<AgencyConfigForm agency={AGENCE} />));
  await user.click(screen.getByRole('checkbox', { name: LIBELLE }));
  await user.click(screen.getByRole('button', { name: fr.common.actions.save }));
  await waitFor(() => expect(updateAgencyAction).toHaveBeenCalledTimes(1));
  expect(vi.mocked(updateAgencyAction).mock.calls[0][1]).toMatchObject({ moderation_required: true });
}

describe('AgencyConfigForm — modération obligatoire (TCK-597)', () => {
  it('l’API persiste la case : succès, case cochée', async () => {
    vi.mocked(updateAgencyAction).mockResolvedValue({ ok: true, data: { ...AGENCE, moderation_required: true } });
    await cocherEtEnregistrer();

    expect(await screen.findByText(fr.admin.agencyConfig.successSaved)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: LIBELLE })).toBeChecked();
  });

  it('l’API rend la valeur d’avant : la case la relit, et l’écran ne dit pas « enregistré »', async () => {
    vi.mocked(updateAgencyAction).mockResolvedValue({ ok: true, data: { ...AGENCE, moderation_required: false } });
    await cocherEtEnregistrer();

    expect(await screen.findByText(fr.admin.agencyConfig.moderation.notSaved)).toBeInTheDocument();
    expect(screen.queryByText(fr.admin.agencyConfig.successSaved)).toBeNull();
    expect(screen.getByRole('checkbox', { name: LIBELLE })).not.toBeChecked();
  });
});
