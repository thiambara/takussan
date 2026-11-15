/**
 * TCK-2645, AC5 — « La caution s'affiche dans sa carte (« Caution · 2 710 000 F · encaissée le 1 juil. ») et ne
 * figure pas parmi les loyers. Le statut « Payé » porte la couleur `--success`. »
 *
 * La carte Caution est rendue pour de vrai (pas de double) : son montant, son état « Encaissée le … » lu sur
 * l'échéance de caution PAYÉE (`paid_at`), en `text-success` (le jeton `--color-success: var(--success)` de
 * `globals.css`). Les autres états prouvent que la date vient de l'échéance et de rien d'autre. Le second
 * volet (« pas parmi les loyers », « Payé » en `--success`) est tenu par `LeaseSchedule.test.tsx`
 * (« AC5 — la caution n'est pas parmi les loyers »).
 *
 * Écart de lettre, noté au ticket : la carte tient sur trois lignes (« Caution · 2 mois », « 2 710 000 F »,
 * « Encaissée le 1 juil. ») — le titre dit les mois quand la caution est un multiple entier du loyer.
 */
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { LeaseWithRelations } from '@/lib/queries/leases';
import type { LeasePayment } from '@/types/lease';
import { CarteCaution, CarteLoyer } from '../CartesDuBail';

/** Espaces fines insécables du formatage des montants, ramenées à l'espace simple. */
const texte = (s: string | null | undefined) => (s ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();

function bail(partiel: Partial<LeaseWithRelations> = {}): LeaseWithRelations {
  return {
    id: 4,
    status: 'active',
    type: 'residential_rent',
    monthly_rent: 1355000,
    deposit_amount: 2710000,
    currency: 'XOF',
    deposit_refunded_at: null,
    renewed_from_lease_id: null,
    ...partiel,
  } as LeaseWithRelations;
}

function caution(partiel: Partial<LeasePayment> = {}): LeasePayment {
  return {
    id: 20,
    payment_type: 'deposit',
    status: 'paid',
    amount: 2710000,
    currency: 'XOF',
    due_date: '2026-07-01',
    period_start: '2026-07-01',
    // Midi UTC : la date se lit au fuseau de Dakar, sans bascule de jour.
    paid_at: '2026-07-01T12:00:00Z',
    is_overdue: false,
    ...partiel,
  } as LeasePayment;
}

const rendre = (lease: LeaseWithRelations, paiements: readonly LeasePayment[] | undefined) =>
  render(withIntl(<CarteCaution lease={lease} paiements={paiements} />));
const carte = () => screen.getByTestId('carte-caution');

beforeEach(() => {
  // `jourMois` tait l'année de l'année en cours : on fige « aujourd'hui » dans l'année de la caution.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('AC5 — la caution dans sa carte (TCK-2645)', () => {
  it('« Caution · 2 mois », 2 710 000 F, « Encaissée le 1 juil. » en `--success`', () => {
    rendre(bail(), [caution()]);
    expect(within(carte()).getByText('Caution · 2 mois')).toBeInTheDocument();
    expect(within(carte()).getByText((_, el) => el?.tagName === 'P' && texte(el.textContent) === '2 710 000 F')).toBeInTheDocument();
    const etat = within(carte()).getByText(/^Encaissée le 1 juil\.$/);
    expect(etat.className).toMatch(/\btext-success\b/);
    expect(etat.className).not.toMatch(/\btext-primary\b/);
  });

  it('la date est celle de l’échéance de caution payée, pas d’une échéance de loyer', () => {
    const loyer = { ...caution(), id: 21, payment_type: 'rent', paid_at: '2026-08-03T12:00:00Z' } as LeasePayment;
    rendre(bail(), [loyer, caution()]);
    expect(within(carte()).getByText(/^Encaissée le 1 juil\.$/)).toBeInTheDocument();
    expect(within(carte()).queryByText(/3 août/)).toBeNull();
  });

  it('une caution due n’est pas « encaissée » : « À encaisser », sans la teinte du succès', () => {
    rendre(bail(), [caution({ status: 'pending', paid_at: null })]);
    const etat = within(carte()).getByText('À encaisser');
    expect(etat.className).not.toMatch(/\btext-success\b/);
    expect(within(carte()).queryByText(/Encaissée/)).toBeNull();
  });

  it('une échéance de caution annulée ne compte pas', () => {
    rendre(bail(), [caution({ status: 'cancelled' })]);
    expect(within(carte()).queryByText(/Encaissée|À encaisser/)).toBeNull();
  });

  it('une caution restituée se dit restituée, même encaissée avant', () => {
    rendre(bail({ deposit_refunded_at: '2026-10-02T12:00:00Z' }), [caution()]);
    expect(within(carte()).getByText(/^Restituée le 2 oct\.$/)).toBeInTheDocument();
    expect(within(carte()).queryByText(/Encaissée/)).toBeNull();
  });

  it('payée sans date d’encaissement : aucune date inventée', () => {
    rendre(bail(), [caution({ paid_at: null })]);
    expect(within(carte()).queryByText(/Encaissée/)).toBeNull();
  });
});

/**
 * Décision 1 a de team-lead (2026-11-14) — dès `xl`, la ligne « Échéancier » du dossier (qui porte « n en retard ») est
 * cachée : la carte Loyer dit le compte quand il y a plus d'un retard. Même lecture que le dossier : hors caution,
 * sur `is_overdue` (jamais sur l'horloge).
 */
describe('la carte Loyer dit le compte des retards dès `xl` (TCK-2645, décision 1 a)', () => {
  const retard = (id: number, mois: string) =>
    ({ id, payment_type: 'rent', status: 'late', is_overdue: true, due_date: `2026-${mois}-05`, period_start: `2026-${mois}-01`, amount: 1355000, remaining_amount: 1355000, late_fee_outstanding: 0, currency: 'XOF', paid_at: null }) as unknown as LeasePayment;
  const loyer = (paiements: readonly LeasePayment[]) =>
    render(withIntl(<CarteLoyer lease={bail({ payment_day: 5 } as Partial<LeaseWithRelations>)} paiements={paiements} />));

  it('deux loyers en retard : « 2 échéances en retard », caché sous `xl` (le dossier le dit au téléphone)', () => {
    loyer([retard(1, '10'), retard(2, '11')]);
    const compte = screen.getByTestId('retards-du-loyer');
    expect(compte).toHaveTextContent(/^2 échéances en retard$/);
    expect(compte.className).toMatch(/\bmax-xl:hidden\b/);
  });

  it('un seul retard : rien de plus que « … en retard de N j »', () => {
    loyer([retard(1, '11')]);
    expect(screen.queryByTestId('retards-du-loyer')).toBeNull();
  });

  it('une caution ou une échéance que l’API ne dit pas échue ne compte pas', () => {
    const caution = { ...retard(3, '07'), payment_type: 'deposit' } as LeasePayment;
    const nonEchue = { ...retard(4, '12'), status: 'pending', is_overdue: false } as LeasePayment;
    loyer([retard(1, '11'), caution, nonEchue]);
    expect(screen.queryByTestId('retards-du-loyer')).toBeNull();
  });
});
