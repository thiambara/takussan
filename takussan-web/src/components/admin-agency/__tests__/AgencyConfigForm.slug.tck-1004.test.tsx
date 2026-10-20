import { beforeEach, describe, expect, it, vi } from 'vitest';
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
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: false, isLoading: false }) }));

import { AgencyConfigForm } from '../AgencyConfigForm';

const agence = (slugEditable: boolean | undefined): Agency => ({
  id: 7,
  name: 'Espace de Awa',
  slug: 'espace-de-awa',
  slug_editable: slugEditable,
  kind: 'standard',
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
});

async function enregistrer() {
  await userEvent.setup().click(screen.getByRole('button', { name: 'Enregistrer' }));
  await waitFor(() => expect(updateAgencyAction).toHaveBeenCalledTimes(1));
  return updateAgencyAction.mock.calls[0]![1] as Record<string, unknown>;
}

/**
 * TCK-1004 (P49.04) — après le passage en professionnelle, le slug « espace-de-… » se remplace une
 * fois. Le champ ne s'ouvre que quand l'API le dit (`slug_editable`), et le slug ne part que modifié.
 */
describe('AgencyConfigForm — slug modifiable une fois après le passage', () => {
  beforeEach(() => {
    updateAgencyAction.mockReset();
    updateAgencyAction.mockResolvedValue({ ok: true, data: agence(false) });
  });

  it('slug_editable : le champ s’édite, et le nouveau slug part', async () => {
    const user = userEvent.setup();
    render(withIntl(<AgencyConfigForm agency={agence(true)} />));

    const champ = screen.getByRole('textbox', { name: 'Identifiant URL (modifiable une fois)' });
    expect(champ).toBeEnabled();
    expect(screen.getByText(/vous pouvez remplacer cet identifiant une seule fois/)).toBeInTheDocument();
    await user.clear(champ);
    await user.type(champ, 'awa-immo');

    expect(await enregistrer()).toMatchObject({ slug: 'awa-immo' });
  });

  it('slug_editable, slug inchangé : il ne part pas, le changement n’est pas consommé', async () => {
    render(withIntl(<AgencyConfigForm agency={agence(true)} />));

    expect(await enregistrer()).not.toHaveProperty('slug');
  });

  it.each([[false], [undefined]])('slug_editable=%s : identifiant en lecture seule, jamais envoyé', async (editable) => {
    render(withIntl(<AgencyConfigForm agency={agence(editable)} />));

    expect(screen.getByLabelText('Identifiant URL (non modifiable)')).toBeDisabled();
    expect(screen.queryByRole('textbox', { name: 'Identifiant URL (modifiable une fois)' })).not.toBeInTheDocument();
    expect(await enregistrer()).not.toHaveProperty('slug');
  });
});
