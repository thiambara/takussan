import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import type { Agency } from '@/types/agency';
import { CODES_DE_MODULE } from '@/lib/navigation/modules';

const ROUTEUR = vi.hoisted(() => ({ refresh: () => {}, back: () => {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ROUTEUR }));
vi.mock('@/app/actions/admin-agency', () => ({
  updateAgencyAction: vi.fn(),
  uploadAgencyLogoAction: vi.fn(),
}));
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: false, isLoading: false }) }));

import { updateAgencyAction } from '@/app/actions/admin-agency';
import { AgencyConfigForm } from '../AgencyConfigForm';

/**
 * TCK-2483 (ADR-0089, amendement « modules par agence ») — la section « Menu de l'équipe ».
 *
 * Cochée = affichée : une agence sans la clé a tout coché ; décocher puis enregistrer envoie
 * `settings.hidden_modules` dans l'ordre des codes, `[]` compris (tout réafficher doit s'enregistrer).
 * Section intacte : la clé ne part pas (revue, M5) — l'API conserve une clé absente, et la liste lue
 * au chargement écraserait celle qu'un autre admin aurait enregistrée depuis.
 * Une agence `individual` n'a pas la section et n'envoie pas la clé (l'API la refuse, 422).
 */

const AGENCE: Agency = {
  id: 7,
  name: 'Dakar Immo',
  slug: 'dakar-immo',
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
};

const M = fr.admin.agencyConfig.modules;
type Code = keyof typeof M.items;
const caseDe = (code: Code) => screen.queryByRole('checkbox', { name: M.items[code].label });

beforeEach(() => {
  vi.mocked(updateAgencyAction).mockReset();
  vi.mocked(updateAgencyAction).mockResolvedValue({ ok: true, data: AGENCE });
});

async function enregistrer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: fr.common.actions.save }));
  await waitFor(() => expect(updateAgencyAction).toHaveBeenCalledTimes(1));
  return vi.mocked(updateAgencyAction).mock.calls[0][1];
}

describe('AgencyConfigForm — menu de l’équipe (TCK-2483)', () => {
  it('chaque code de module a son libellé, et seulement eux', () => {
    expect(Object.keys(M.items)).toEqual([...CODES_DE_MODULE]);
  });

  it('une agence sans la clé : les sept modules sont affichés (cases cochées)', () => {
    render(withIntl(<AgencyConfigForm agency={AGENCE} />));
    expect(screen.getByRole('heading', { name: M.title })).toBeInTheDocument();
    for (const code of CODES_DE_MODULE) {
      expect(caseDe(code), code).toBeChecked();
    }
  });

  it('un module masqué a sa case décochée, et la case dit ce qu’elle retire', () => {
    render(withIntl(<AgencyConfigForm agency={{ ...AGENCE, settings: { hidden_modules: ['commissions'] } }} />));
    expect(caseDe('commissions')).not.toBeChecked();
    expect(caseDe('calendar')).toBeChecked();
    expect(caseDe('analytics')).toHaveAccessibleDescription(M.items.analytics.hint);
  });

  it('section intacte : enregistrer la fiche n’envoie pas la liste lue au chargement', async () => {
    const user = userEvent.setup();
    render(withIntl(<AgencyConfigForm agency={{ ...AGENCE, settings: { hidden_modules: ['analytics'] } }} />));
    await user.type(screen.getByRole('textbox', { name: fr.admin.agencyConfig.fields.name }), ' Plateau');
    expect((await enregistrer(user)).settings ?? {}).not.toHaveProperty('hidden_modules');
  });

  it('un code inconnu lu sur l’agence ne décoche rien, et ne repart pas quand une case change', async () => {
    const user = userEvent.setup();
    render(withIntl(<AgencyConfigForm agency={{ ...AGENCE, settings: { hidden_modules: ['obsolete', 'credits'] } }} />));
    for (const code of CODES_DE_MODULE) {
      if (code === 'credits') expect(caseDe(code)).not.toBeChecked();
      else expect(caseDe(code), code).toBeChecked();
    }
    await user.click(caseDe('calendar')!);
    expect((await enregistrer(user)).settings).toMatchObject({ hidden_modules: ['calendar', 'credits'] });
  });

  it('décocher « Calendrier » puis enregistrer envoie la liste dans l’ordre des codes', async () => {
    const user = userEvent.setup();
    render(withIntl(<AgencyConfigForm agency={{ ...AGENCE, settings: { hidden_modules: ['analytics'] } }} />));
    await user.click(caseDe('calendar')!);
    expect(caseDe('calendar')).not.toBeChecked();
    const payload = await enregistrer(user);
    expect(payload.settings).toMatchObject({ hidden_modules: ['calendar', 'analytics'] });
  });

  it('tout recocher envoie une liste vide (le réaffichage s’enregistre)', async () => {
    const user = userEvent.setup();
    render(withIntl(<AgencyConfigForm agency={{ ...AGENCE, settings: { hidden_modules: ['credits'] } }} />));
    await user.click(caseDe('credits')!);
    expect(caseDe('credits')).toBeChecked();
    expect((await enregistrer(user)).settings).toMatchObject({ hidden_modules: [] });
  });

  it('une agence individuelle n’a pas la section et n’envoie pas la clé', async () => {
    const user = userEvent.setup();
    render(
      withIntl(<AgencyConfigForm agency={{ ...AGENCE, kind: 'individual', settings: { hidden_modules: ['calendar'] } }} />),
    );
    expect(screen.queryByRole('heading', { name: M.title })).toBeNull();
    expect(caseDe('calendar')).toBeNull();
    expect((await enregistrer(user)).settings ?? {}).not.toHaveProperty('hidden_modules');
  });
});
