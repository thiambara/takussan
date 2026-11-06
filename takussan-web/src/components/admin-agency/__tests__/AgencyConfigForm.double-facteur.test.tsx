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
// Le formulaire lit `useCan('payouts.approve')` depuis TCK-594 (seuil des quatre yeux).
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: false, isLoading: false }) }));

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

  /**
   * TCK-2486 — relevé au navigateur par TCK-2483 (suite (b)) : l'admin B, fiche ouverte avant que l'admin A
   * n'exige la 2FA, enregistrait son nom et renvoyait `false` — l'exigence tombait sans que personne
   * ne l'ait décochée. Ne part que ce qui a changé ; décocher reste une modification.
   */
  it('TCK-2486 — enregistrer sans toucher la case ne renvoie pas le réglage chargé', async () => {
    const user = userEvent.setup();
    updateAgencyAction.mockReset();
    updateAgencyAction.mockResolvedValue({ ok: true, data: agence({ require_team_two_factor: true }) });
    render(withIntl(<AgencyConfigForm agency={agence({ require_team_two_factor: true })} />));

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(updateAgencyAction).toHaveBeenCalledTimes(1));
    expect(updateAgencyAction.mock.calls[0]![1]).not.toHaveProperty('settings');
  });

  /**
   * TCK-2487 — une agence `individual` n'a pas d'équipe, et l'interrupteur n'a aucun effet sur l'hôte
   * (déjà tenu à la 2FA en tant qu'admin d'agence) : pas de section, et la clé ne part jamais (l'API la
   * refuse, 422), même quand une valeur ancienne la porte à `true`.
   */
  it('TCK-2487 — une agence individuelle n’a pas la section et n’envoie jamais la clé', async () => {
    const user = userEvent.setup();
    updateAgencyAction.mockReset();
    const hote: Agency = { ...agence({ require_team_two_factor: true }), kind: 'individual' };
    updateAgencyAction.mockResolvedValue({ ok: true, data: hote });
    render(withIntl(<AgencyConfigForm agency={hote} />));

    expect(screen.queryByRole('checkbox', { name: libelle })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Sécurité de l’équipe' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(updateAgencyAction).toHaveBeenCalledTimes(1));
    expect(updateAgencyAction.mock.calls[0]![1].settings ?? {}).not.toHaveProperty('require_team_two_factor');
  });

  it('TCK-2487 — une agence standard garde la section', () => {
    render(withIntl(<AgencyConfigForm agency={{ ...agence(null), kind: 'standard' }} />));
    expect(screen.getByRole('heading', { name: 'Sécurité de l’équipe' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: libelle })).toBeInTheDocument();
  });

  it('TCK-2486 — décocher la case chargée cochée envoie false', async () => {
    const user = userEvent.setup();
    updateAgencyAction.mockReset();
    updateAgencyAction.mockResolvedValue({ ok: true, data: agence({ require_team_two_factor: false }) });
    render(withIntl(<AgencyConfigForm agency={agence({ require_team_two_factor: true })} />));

    await user.click(screen.getByRole('checkbox', { name: libelle }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(updateAgencyAction).toHaveBeenCalledTimes(1));
    expect(updateAgencyAction.mock.calls[0]![1]).toMatchObject({ settings: { require_team_two_factor: false } });
  });

  /**
   * Revue adverse de TCK-2486, M1 — la référence « inchangé » était le `settings` de la prop, qui ne bouge
   * qu'à l'ARRIVÉE de `router.refresh()` (non attendu). Ici `refresh` ne fait rien : cocher, enregistrer,
   * décocher, enregistrer — le second envoi ne partait pas (`false` égal à la référence périmée), la base
   * gardait `true` et l'écran disait « Modifications enregistrées. » sur une case décochée.
   */
  it('revue M1 — deux enregistrements avant le refresh : le retour à false part', async () => {
    const user = userEvent.setup();
    updateAgencyAction.mockReset();
    updateAgencyAction.mockResolvedValue({ ok: true, data: agence({ require_team_two_factor: true }) });
    render(withIntl(<AgencyConfigForm agency={agence(null)} />));

    const caseACocher = screen.getByRole('checkbox', { name: libelle });
    await user.click(caseACocher);
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(updateAgencyAction).toHaveBeenCalledTimes(1));
    expect(updateAgencyAction.mock.calls[0]![1].settings).toEqual({ require_team_two_factor: true });

    updateAgencyAction.mockResolvedValue({ ok: true, data: agence({ require_team_two_factor: false }) });
    await user.click(caseACocher);
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(updateAgencyAction).toHaveBeenCalledTimes(2));
    expect(updateAgencyAction.mock.calls[1]![1].settings).toEqual({ require_team_two_factor: false });
    expect(caseACocher).not.toBeChecked();
  });

  /**
   * Revue adverse de TCK-2486, M1 — la RÉPONSE de l'API fait foi, pour la référence ET pour l'écran : un
   * réglage qu'un autre admin a posé entre le chargement et l'enregistrement s'affiche, et l'envoi suivant
   * ne le défait pas. Recaler la seule référence, l'écran restant périmé, aurait renvoyé `false`.
   */
  it('revue M1 — un réglage posé ailleurs entre-temps s’affiche après l’enregistrement et n’est pas défait', async () => {
    const user = userEvent.setup();
    updateAgencyAction.mockReset();
    updateAgencyAction.mockResolvedValue({ ok: true, data: agence({ require_team_two_factor: true }) });
    render(withIntl(<AgencyConfigForm agency={agence(null)} />));

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(updateAgencyAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: libelle })).toBeChecked());

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(updateAgencyAction).toHaveBeenCalledTimes(2));
    expect(updateAgencyAction.mock.calls[1]![1]).not.toHaveProperty('settings');
  });
});
