/**
 * TCK-2946 — l'écran 2 du prestataire invité : la carte complète (échéance, signalement, citation, « Voir le
 * détail »), et au bureau « Tarifs », « Disponibilités » et « Enregistrer mon profil » dans l'écran, par les MÊMES
 * écritures que le profil (`PATCH …/trades` tarifs seuls, `PATCH …/availability`).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import frMessages from '@/messages/fr.json';
import type { InterventionDOrigine, ReglagesDuPrestataire } from '@/lib/service-provider-onboarding';
import { withIntl } from '@/test/intl';

const spPatchTradesAction = vi.fn();
const spPatchAvailabilityAction = vi.fn();
const spAccepterInterventionAction = vi.fn();
vi.mock('@/app/actions/service-provider-onboarding', () => ({
  spPatchTradesAction: (...a: unknown[]) => spPatchTradesAction(...a),
  spPatchAvailabilityAction: (...a: unknown[]) => spPatchAvailabilityAction(...a),
  spAccepterInterventionAction: (...a: unknown[]) => spAccepterInterventionAction(...a),
}));

import { InterventionDuPrestataire } from '../InterventionDuPrestataire';

const P = frMessages.onboarding.invite.prestataire;
const R = P.reglages;
const MAINTENANT = new Date('2026-11-10T10:00:00Z');

const INTERVENTION: InterventionDOrigine = {
  id: 501,
  title: 'Fuite sous évier',
  category: 'plumbing',
  place: { quarter: 'Mermoz', city: 'Dakar' },
  photo: { url: 'https://api.test/m/1', thumbnail_url: 'https://api.test/m/1/v', count: 2 },
  quote: null,
  respond_by: '2026-11-12T09:00:00Z',
  reported_at: '2026-11-09T08:30:00Z',
  reference: 'INT-0042',
  reported_by_role: 'tenant',
  tenant_quote: 'L’eau coule sous le meuble dès qu’on ouvre le robinet.',
  detail_url: '/app/maintenance/501',
};

const REGLAGES: ReglagesDuPrestataire = {
  id: 31,
  trades: ['plumbing'],
  intervention_zones: ['Mermoz'],
  hourly_rate: '5000.00',
  visit_fee: 3000,
  available_slots: [
    { day: 'monday', from: '08:00', to: '12:00' },
    { day: 'monday', from: '17:00', to: '21:00' },
  ],
};

const onAller = vi.fn();

function monter(props: Partial<React.ComponentProps<typeof InterventionDuPrestataire>> = {}) {
  return render(
    withIntl(
      <InterventionDuPrestataire
        agence="Dakar Immo"
        telephone="+221775305678"
        intervention={INTERVENTION}
        categorie="Plomberie"
        reglages={REGLAGES}
        pieces={null}
        finaliser={async () => true}
        onAller={onAller}
        enCours={false}
        {...props}
      />,
    ),
  );
}

describe('InterventionDuPrestataire — la carte complète et les réglages au bureau (TCK-2946)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(MAINTENANT);
    spPatchTradesAction.mockResolvedValue({ ok: true, data: { id: 31 } });
    spPatchAvailabilityAction.mockResolvedValue({ ok: true, data: { id: 31 } });
  });
  afterEach(() => vi.useRealTimers());

  it('AC1 — pastille depuis `respond_by`, « Signalée par le locataire le 9 nov. · réf. INT-0042 », la citation, le détail après acceptation', () => {
    monter();
    const carte = screen.getByTestId('intervention-501');
    // 2026-11-12 09:00 − 2026-11-10 10:00 = 47 h : jamais « 48 h » en dur.
    expect(carte.querySelector('[data-echeance]')).toHaveTextContent('À traiter sous 47 h');
    expect(carte.querySelector('[data-signalement]')).toHaveTextContent('Signalée par le locataire le 9 nov. · réf. INT-0042');
    expect(carte.querySelector('[data-citation]')).toHaveTextContent('« L’eau coule sous le meuble dès qu’on ouvre le robinet. »');
    expect(within(carte).queryByRole('button', { name: P.carte.voirLeDetail })).toBeNull();
    expect(carte.querySelector('[data-detail-apres]')).toHaveTextContent(P.carte.detailApres);
  });

  it('AC1 — échéance dépassée, lointaine ou absente ; signalé par l’agence, sans citation : la note d’adresse reste', () => {
    const { unmount } = monter({
      intervention: { ...INTERVENTION, respond_by: '2026-11-09T00:00:00Z', reported_by_role: 'agency', tenant_quote: null },
    });
    expect(document.querySelector('[data-echeance]')).toHaveTextContent(P.carte.echeance.depassee);
    expect(document.querySelector('[data-signalement]')).toHaveTextContent('Signalée par l’agence le 9 nov.');
    expect(screen.getByText(P.carte.adresseApres)).toBeInTheDocument();
    unmount();

    const { unmount: u2 } = monter({ intervention: { ...INTERVENTION, respond_by: '2026-11-20T09:00:00Z' } });
    expect(document.querySelector('[data-echeance]')).toHaveTextContent('À traiter avant le 20 nov.');
    u2();

    monter({ intervention: { ...INTERVENTION, respond_by: null, photo: null } });
    expect(document.querySelector('[data-echeance]')).toBeNull();
  });

  it('AC1 — après « Accepter », « Voir le détail » mène à `detail_url`', async () => {
    spAccepterInterventionAction.mockResolvedValue({ ok: true, data: { id: 501, scheduled_at: null, accepted_at: '2026-11-10T10:00:00Z' } });
    monter();
    fireEvent.click(screen.getByRole('button', { name: P.accepter }));
    const voir = await within(screen.getByTestId('intervention-501')).findByRole('button', { name: P.carte.voirLeDetail });
    fireEvent.click(voir);
    expect(onAller).toHaveBeenCalledWith('/app/maintenance/501');
  });

  it('AC2 — Tarifs (F CFA) et 14 cases Matin / Après-midi préremplis depuis le profil', () => {
    monter();
    const bloc = screen.getByTestId('tarifs-et-disponibilites');
    expect(within(bloc).getByLabelText(R.horaire)).toHaveValue(5000);
    expect(within(bloc).getByLabelText(R.visite)).toHaveValue(3000);
    const cases = within(bloc).getAllByRole('switch');
    expect(cases).toHaveLength(14);
    expect(cases.filter((c) => c.getAttribute('aria-checked') === 'true').map((c) => c.getAttribute('data-creneau'))).toEqual(['monday-morning']);
  });

  it('AC2 — « Enregistrer mon profil » écrit les tarifs SEULS et les créneaux, garde le soir, puis la liste se met à jour', async () => {
    monter();
    const bloc = screen.getByTestId('tarifs-et-disponibilites');
    const enregistrer = within(bloc).getByRole('button', { name: R.enregistrer });
    expect(enregistrer).toBeDisabled();
    fireEvent.change(within(bloc).getByLabelText(R.horaire), { target: { value: '6000' } });
    fireEvent.click(within(bloc).getByRole('switch', { name: 'Mardi, Après-midi' }));
    fireEvent.click(enregistrer);

    await waitFor(() => expect(spPatchAvailabilityAction).toHaveBeenCalled());
    expect(spPatchTradesAction).toHaveBeenCalledWith(31, { hourly_rate: 6000, visit_fee: 3000 });
    expect(spPatchAvailabilityAction).toHaveBeenCalledWith(31, [
      { day: 'monday', from: '08:00', to: '12:00' },
      { day: 'monday', from: '17:00', to: '21:00' },
      { day: 'tuesday', from: '12:00', to: '17:00' },
    ]);
    expect(await within(bloc).findByRole('status')).toHaveTextContent(R.enregistre);
    expect(document.querySelector('[data-ligne-du-profil=tarifs]')).toHaveTextContent(/6\s000\sF\sCFA de l’heure/);
    expect(document.querySelector('[data-ligne-du-profil=disponibilites]')).toHaveTextContent('3 créneaux par semaine');
  });

  it('AC2 — rien de changé côté tarifs : aucune écriture des tarifs ; une erreur de l’API s’écrit sous son champ', async () => {
    spPatchTradesAction.mockResolvedValue({ ok: false, status: 422, message: 'Invalide', errors: { visit_fee: ['Le montant est trop élevé.'] } });
    monter();
    const bloc = screen.getByTestId('tarifs-et-disponibilites');
    fireEvent.click(within(bloc).getByRole('switch', { name: 'Lundi, Matin' }));
    fireEvent.click(within(bloc).getByRole('button', { name: R.enregistrer }));
    await waitFor(() => expect(spPatchAvailabilityAction).toHaveBeenCalledWith(31, [{ day: 'monday', from: '17:00', to: '21:00' }]));
    expect(spPatchTradesAction).not.toHaveBeenCalled();

    fireEvent.change(within(bloc).getByLabelText(R.visite), { target: { value: '999999999' } });
    fireEvent.click(within(bloc).getByRole('button', { name: R.enregistrer }));
    expect(await within(bloc).findByText('Le montant est trop élevé.')).toHaveAttribute('data-erreur-du-champ', 'visit_fee');
    expect(within(bloc).getByLabelText(R.visite)).toHaveAttribute('aria-invalid', 'true');
  });

  it('AC3 — réglages illisibles : aucun formulaire (rien ne s’écrase), « Plus tard » reste ; les lignes mènent au profil', () => {
    monter({ reglages: null });
    expect(screen.queryByTestId('tarifs-et-disponibilites')).toBeNull();
    expect(screen.getAllByRole('button', { name: P.plusTard })).toHaveLength(1);
    fireEvent.click(document.querySelector('[data-ligne-du-profil=tarifs]')!);
    expect(onAller).toHaveBeenCalledWith('/app/profile/professional');
  });

  it('AC3 — les champs ne se dessinent qu’au bureau ; un seul « Plus tard » dans la page', () => {
    monter();
    const bloc = screen.getByTestId('tarifs-et-disponibilites');
    expect(within(bloc).getByLabelText(R.horaire).closest('.hidden')).toHaveClass('lg:block');
    expect(within(bloc).getByRole('button', { name: R.enregistrer })).toHaveClass('hidden', 'lg:inline-flex');
    expect(screen.getAllByRole('button', { name: P.plusTard })).toHaveLength(1);
  });

  it('AC4 — déjà prestataire d’une autre agence : « Vous travaillez déjà avec Thiès Properties »', () => {
    monter({ autresAgences: ['Thiès Properties'] });
    expect(screen.getByTestId('multi-agences')).toHaveTextContent('Vous travaillez déjà avec Thiès Properties');
    expect(screen.getByTestId('multi-agences')).toHaveTextContent('Dakar Immo s’ajoute à vos agences');
  });
});
