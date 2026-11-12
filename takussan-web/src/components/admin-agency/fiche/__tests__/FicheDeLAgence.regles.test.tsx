import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', async () => (await import('./doublures')).navigation);
vi.mock('@/app/actions/admin-agency', async () => (await import('./doublures')).ACTIONS);
vi.mock('@/context/AuthContext', async () => (await import('./doublures')).auth);
vi.mock('@/hooks/useCan', async () => (await import('./doublures')).can);
vi.mock('@/lib/queries/kyc', async () => (await import('./doublures')).KYC);
vi.mock('@/lib/queries/admin-users', async (original) => ({ ...(await original<object>()), ...(await import('./doublures')).EQUIPE }));
vi.mock('@/lib/queries/agency-queues', async (original) => ({ ...(await original<object>()), ...(await import('./doublures')).fileDeModeration }));

import fr from '@/messages/fr.json';
import type { Agency } from '@/types/agency';

import { ACTIONS, CAN, EQUIPE, MODERATION, MOI, reinitialiserLesDoublures } from './doublures';
import { AGENCE, INDIVIDUELLE, barreDuBureau, champ, enregistrer, rendreLaFiche, type Utilisateur } from './outils';

/**
 * TCK-2670 — la section « Règles » de la fiche : modération (TCK-597, TCK-686), pénalités en ligne
 * (TCK-593), seuil des reversements (TCK-594, VERIF-594), 2FA de l'équipe (TCK-589, TCK-2486,
 * TCK-2487) — portés de `AgencyConfigForm` — et ses deux pieds neufs : le compte de la file de
 * modération, et les membres sans second facteur.
 *
 * Une seule règle de fond, tenue depuis TCK-2486 : ne part que ce qui a changé. La fiche n'a plus
 * d'« Enregistrer » sans modification : un test qui enregistrait « sans rien toucher » modifie ici
 * un AUTRE champ, et vérifie que le réglage ne part pas avec lui.
 */

const C = fr.admin.agencyConfig;
const interrupteur = (libelle: string) => screen.getByRole('switch', { name: new RegExp(`^${libelle}`) });
const deuxFacteurs = () => interrupteur(C.security.teamTwoFactorLabel);
const moderation = () => interrupteur(C.moderation.label);
const penalites = () => interrupteur(C.lateFeeOnline.label);
const ouvrir = (agence: Agency) => rendreLaFiche(agence, { section: 'regles' });
const avec = (settings: Agency['settings'], autre: Partial<Agency> = {}): Agency => ({ ...AGENCE, settings, ...autre });

/** Modifier un autre champ de la fiche (identité), pour enregistrer sans toucher aux règles. */
async function autreModification(user: Utilisateur, valeur = '+221338210000') {
  await user.click(screen.getAllByRole('link', { name: /Identité et contact/ })[0]);
  await user.clear(champ('phone'));
  await user.type(champ('phone'), valeur);
}

beforeEach(() => {
  reinitialiserLesDoublures();
  ACTIONS.updateAgencyAction.mockResolvedValue({ ok: true, data: AGENCE });
});

describe('2FA obligatoire pour l’équipe (TCK-589)', () => {
  it('reflète le réglage enregistré', () => {
    ouvrir(avec({ require_team_two_factor: true }));
    expect(deuxFacteurs()).toBeChecked();
  });

  it('activer puis enregistrer envoie `settings.require_team_two_factor: true`, seul', async () => {
    const user = userEvent.setup();
    ACTIONS.updateAgencyAction.mockResolvedValue({ ok: true, data: avec({ require_team_two_factor: true }) });
    ouvrir(avec(null));
    expect(deuxFacteurs()).not.toBeChecked();
    await user.click(deuxFacteurs());
    expect(await enregistrer(user)).toEqual({ settings: { require_team_two_factor: true } });
  });

  it('TCK-2486 — enregistrer une autre modification ne renvoie pas le réglage chargé', async () => {
    const user = userEvent.setup();
    ouvrir(avec({ require_team_two_factor: true }));
    await autreModification(user);
    expect(await enregistrer(user)).toEqual({ phone: '+221338210000' });
  });

  it('TCK-2487 — une agence individuelle n’a pas la section Sécurité, et la clé ne part jamais', async () => {
    const user = userEvent.setup();
    const hote: Agency = { ...INDIVIDUELLE, settings: { require_team_two_factor: true } };
    ACTIONS.updateAgencyAction.mockResolvedValue({ ok: true, data: hote });
    ouvrir(hote);
    expect(screen.queryByRole('switch', { name: new RegExp(`^${C.security.teamTwoFactorLabel}`) })).toBeNull();
    expect(screen.queryByRole('group', { name: fr.admin.agencyConfig.fiche.regles.groupeSecurite })).toBeNull();
    await autreModification(user);
    expect(await enregistrer(user)).toEqual({ phone: '+221338210000' });
  });

  it('TCK-2487 — une agence standard garde la section', () => {
    ouvrir(avec(null));
    expect(screen.getByRole('group', { name: fr.admin.agencyConfig.fiche.regles.groupeSecurite })).toBeInTheDocument();
    expect(deuxFacteurs()).toBeInTheDocument();
  });

  it('TCK-2486 — désactiver le réglage chargé actif envoie false', async () => {
    const user = userEvent.setup();
    ACTIONS.updateAgencyAction.mockResolvedValue({ ok: true, data: avec({ require_team_two_factor: false }) });
    ouvrir(avec({ require_team_two_factor: true }));
    await user.click(deuxFacteurs());
    expect(await enregistrer(user)).toEqual({ settings: { require_team_two_factor: false } });
  });

  // Revue adverse de TCK-2486, M1 — la référence suit la RÉPONSE, pas la prop (que `refresh` ne relit pas ici).
  it('revue M1 — deux enregistrements avant le refresh : le retour à false part', async () => {
    const user = userEvent.setup();
    ACTIONS.updateAgencyAction.mockResolvedValue({ ok: true, data: avec({ require_team_two_factor: true }) });
    ouvrir(avec(null));
    await user.click(deuxFacteurs());
    expect(await enregistrer(user)).toEqual({ settings: { require_team_two_factor: true } });
    await waitFor(() => expect(barreDuBureau()).toBeNull());

    ACTIONS.updateAgencyAction.mockResolvedValue({ ok: true, data: avec({ require_team_two_factor: false }) });
    await user.click(deuxFacteurs());
    expect(await enregistrer(user, 2)).toEqual({ settings: { require_team_two_factor: false } });
    await waitFor(() => expect(deuxFacteurs()).not.toBeChecked());
  });

  it('revue M1 — un réglage posé ailleurs entre-temps s’affiche après l’enregistrement et n’est pas défait', async () => {
    const user = userEvent.setup();
    ACTIONS.updateAgencyAction.mockResolvedValue({ ok: true, data: avec({ require_team_two_factor: true }, { phone: '+221338210000' }) });
    ouvrir(avec(null));
    await autreModification(user);
    await enregistrer(user);
    await user.click(screen.getAllByRole('link', { name: /Règles/ })[0]);
    await waitFor(() => expect(deuxFacteurs()).toBeChecked());

    await autreModification(user, '+221338210001');
    expect(await enregistrer(user, 2)).toEqual({ phone: '+221338210001' });
  });

  it('dit combien de membres n’ont pas activé leur second facteur, et mène à l’équipe', async () => {
    EQUIPE.fetchDoubleFacteurDeLEquipe.mockResolvedValue({ sans: 2, lus: 5, total: 5 });
    ouvrir(avec(null));
    expect(await screen.findByText('2 membres sur 5 ne l’ont pas encore activée')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Voir l’équipe/ })).toHaveAttribute('href', '/app/agency/team');
  });

  it('une équipe lue en partie (plus de 100 membres) dit « au moins »', async () => {
    EQUIPE.fetchDoubleFacteurDeLEquipe.mockResolvedValue({ sans: 3, lus: 100, total: 140 });
    ouvrir(avec(null));
    expect(await screen.findByText('Au moins 3 membres sur 140 ne l’ont pas encore activée')).toBeInTheDocument();
  });

  it('une équipe à jour, ou illisible, ne dit rien', async () => {
    EQUIPE.fetchDoubleFacteurDeLEquipe.mockRejectedValue(new Error('500'));
    ouvrir(avec(null));
    await waitFor(() => expect(EQUIPE.fetchDoubleFacteurDeLEquipe).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: /Voir l’équipe/ })).toBeNull();
  });
});

describe('modération obligatoire (TCK-597, TCK-686)', () => {
  const AVANT: Agency = { ...AGENCE, moderation_required: false };

  it('l’API persiste la case : succès, case activée', async () => {
    ACTIONS.updateAgencyAction.mockResolvedValue({ ok: true, data: { ...AVANT, moderation_required: true } });
    const user = userEvent.setup();
    ouvrir(AVANT);
    await user.click(moderation());
    expect(await enregistrer(user)).toEqual({ moderation_required: true });
    expect(await screen.findByText(C.successSaved)).toBeInTheDocument();
    expect(moderation()).toBeChecked();
  });

  it('l’API rend la valeur d’avant : la case la relit, et l’écran ne dit pas « enregistré »', async () => {
    ACTIONS.updateAgencyAction.mockResolvedValue({ ok: true, data: AVANT });
    const user = userEvent.setup();
    ouvrir(AVANT);
    await user.click(moderation());
    await enregistrer(user);
    expect(await screen.findByText(C.moderation.notSaved)).toBeInTheDocument();
    expect(screen.queryByText(C.successSaved)).toBeNull();
    expect(moderation()).not.toBeChecked();
  });

  it('une agence individuelle n’a pas la case, et n’envoie pas moderation_required', async () => {
    const hote: Agency = { ...INDIVIDUELLE, moderation_required: false };
    ACTIONS.updateAgencyAction.mockResolvedValue({ ok: true, data: hote });
    const user = userEvent.setup();
    ouvrir(hote);
    expect(screen.queryByRole('switch', { name: new RegExp(`^${C.moderation.label}`) })).toBeNull();
    await autreModification(user);
    expect(await enregistrer(user)).toEqual({ phone: '+221338210000' });
    expect(await screen.findByText(C.successSaved)).toBeInTheDocument();
  });

  it('dit combien de biens attendent la validation, et mène à la file', async () => {
    MODERATION.compte.mockResolvedValue(3);
    ouvrir(AVANT);
    expect(await screen.findByText('3 biens attendent votre validation')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ouvrir la file/ })).toHaveAttribute('href', '/app/agency/moderation/properties');
  });
});

describe('pénalités de retard en ligne (TCK-593 Partie 5)', () => {
  it('une agence sans la clé a le réglage DÉSACTIVÉ', () => {
    ouvrir(avec(null));
    expect(penalites()).not.toBeChecked();
  });

  it('une agence qui l’a activé le voit activé', () => {
    ouvrir(avec({ late_fee_online_collection: true }));
    expect(penalites()).toBeChecked();
  });

  // Revue adverse de TCK-2486, M2 — l'API lit ce réglage par `filter_var` : un `1` stocké l'ACTIVE.
  it.each([1, '1', 'true', 'on', 'yes'])('revue M2 — une valeur %j, vraie pour l’API, s’affiche activée et n’est pas une modification', (valeur) => {
    ouvrir(avec({ late_fee_online_collection: valeur } as unknown as Agency['settings']));
    expect(penalites()).toBeChecked();
    expect(barreDuBureau()).toBeNull();
  });

  it.each([0, '0', 'off', 'no', 'false'])('revue M2 — une valeur %j, fausse pour l’API, s’affiche désactivée', (valeur) => {
    ouvrir(avec({ late_fee_online_collection: valeur } as unknown as Agency['settings']));
    expect(penalites()).not.toBeChecked();
  });

  it('explique les deux positions', () => {
    ouvrir(avec(null));
    expect(penalites()).toHaveAccessibleDescription(C.lateFeeOnline.hint);
  });

  it('activer puis enregistrer envoie le réglage à true', async () => {
    const user = userEvent.setup();
    ouvrir(avec(null));
    await user.click(penalites());
    expect(await enregistrer(user)).toEqual({ settings: { late_fee_online_collection: true } });
  });

  it('n’envoie que les clés modifiées : les réglages que la fiche ne montre pas ne sont ni renvoyés ni vidés', async () => {
    const user = userEvent.setup();
    ouvrir(avec({ watermark_enabled: false, welcome: { standard_unlocked_at: null }, timezone: 'Africa/Dakar' } as Agency['settings']));
    await autreModification(user);
    expect(await enregistrer(user)).toEqual({ phone: '+221338210000' });
  });

  it('TCK-2486 — désactiver un réglage chargé actif envoie false', async () => {
    const user = userEvent.setup();
    ouvrir(avec({ late_fee_online_collection: true }));
    await user.click(penalites());
    expect(await enregistrer(user)).toEqual({ settings: { late_fee_online_collection: false } });
  });
});

describe('seuil des reversements (TCK-594, VERIF-594 M-2)', () => {
  const M = C.moneyOut;
  const seuil = () => screen.queryByLabelText(/Seuil d’approbation/);
  const EN_ATTENTE: Agency = {
    ...AGENCE,
    payout_approval_threshold: 100000,
    pending_payout_threshold_change: { threshold: null, requested_by_id: 9, requested_at: '2026-10-08T09:00:00Z' },
  };

  it('propose le seuil au seul détenteur de payouts.approve', () => {
    CAN.current = { can: false, isLoading: false };
    const { unmount } = ouvrir(AGENCE);
    expect(seuil()).toBeNull();
    unmount();

    CAN.current = { can: true, isLoading: false };
    ouvrir(AGENCE);
    expect(seuil()).toBeInTheDocument();
  });

  it('n’envoie pas le seuil inchangé', async () => {
    CAN.current = { can: true, isLoading: false };
    const user = userEvent.setup();
    ouvrir({ ...INDIVIDUELLE, payout_approval_threshold: 500000 });
    await autreModification(user);
    expect(await enregistrer(user)).toEqual({ phone: '+221338210000' });
  });

  it('montre la demande en attente, et laisse un autre approbateur la confirmer (la valeur affichée : null, couper)', async () => {
    CAN.current = { can: true, isLoading: false };
    MOI.current = { user: { id: 11 }, token: 'jeton' };
    ACTIONS.confirmPayoutThresholdAction.mockResolvedValue({ ok: true, data: AGENCE });
    const user = userEvent.setup();
    ouvrir(EN_ATTENTE);
    expect(screen.getByText(M.thresholdPendingOff)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: M.thresholdConfirm }));
    expect(ACTIONS.confirmPayoutThresholdAction).toHaveBeenCalledWith(7, null);
    expect(ACTIONS.updateAgencyAction).not.toHaveBeenCalled();
  });

  it('confirme la valeur relevée affichée, pas la demande en cours côté serveur (VERIF-594 passe 2, N-5)', async () => {
    CAN.current = { can: true, isLoading: false };
    ACTIONS.confirmPayoutThresholdAction.mockResolvedValue({ ok: true, data: AGENCE });
    const user = userEvent.setup();
    ouvrir({ ...EN_ATTENTE, pending_payout_threshold_change: { threshold: 150000, requested_by_id: 9, requested_at: '2026-10-08T09:00:00Z' } });
    await user.click(screen.getByRole('button', { name: M.thresholdConfirm }));
    expect(ACTIONS.confirmPayoutThresholdAction).toHaveBeenCalledWith(7, 150000);
  });

  it('au demandeur, dit qu’un autre doit confirmer, sans bouton', () => {
    CAN.current = { can: true, isLoading: false };
    MOI.current = { user: { id: 9 }, token: 'jeton' };
    ouvrir(EN_ATTENTE);
    expect(screen.getByText(M.thresholdPendingSelf)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: M.thresholdConfirm })).toBeNull();
  });

  it('un enregistrement qui demande un relâchement ne se dit pas « enregistré » tout court', async () => {
    CAN.current = { can: true, isLoading: false };
    MOI.current = { user: { id: 9 }, token: 'jeton' };
    ACTIONS.updateAgencyAction.mockResolvedValue({ ok: true, data: EN_ATTENTE });
    const user = userEvent.setup();
    ouvrir({ ...AGENCE, payout_approval_threshold: 100000 });
    await user.clear(seuil()!);
    await enregistrer(user);
    expect(await screen.findByText(M.thresholdPendingSaved)).toBeInTheDocument();
  });
});
