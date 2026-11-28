import { describe, expect, it } from 'vitest';

import type { Booking, BookingAbilities, BookingPayment } from '@/types/booking';
import { AUCUN_GESTE, gestesDeLaReservation, paiementsRemboursables } from '../gestes';

/**
 * TCK-3007 (ADR-0139) — les gestes de la fiche d'une réservation, en fonction pure : `abilities` les
 * PERMET (l'API a jugé capacité, rôle et état), la fonction ne fait que les PRÉSENTER. Remplace les
 * tests de règle par rendu (`capabilities`, `sejour-commence`, `jour-de-l-api.*`, `creer-le-bail`) :
 * le premier jour d'un séjour, la capacité de l'agence et la nature se jugent désormais à l'API
 * (`tests/Feature/Api/BookingGestesTest.php`).
 */

const RIEN: BookingAbilities = {
  confirm: false,
  reject: false,
  cancel: false,
  counter_offer: false,
  answer_counter_offer: false,
  record_payment: false,
  refund: false,
  create_lease: false,
  pay: false,
  upload_dossier_piece: false,
  request_dossier_piece: false,
  manage_guarantors: false,
  leave_review: false,
};

const PAYE: BookingPayment = { id: 1, amount: 50_000, refund_amount: 0, status: 'paid', payment_type: 'deposit', refundable: true } as BookingPayment;

function reservation(abilities: Partial<BookingAbilities> | undefined, extra: Partial<Booking> = {}): Booking {
  return {
    id: 7,
    kind: 'stay',
    status: 'pending',
    ...(abilities ? { abilities: { ...RIEN, ...abilities } } : {}),
    ...extra,
  } as Booking;
}

describe('gestesDeLaReservation (TCK-3007)', () => {
  it('sans `abilities` (chargement, liste), aucun geste : rien d’optimiste', () => {
    expect(gestesDeLaReservation(reservation(undefined, { status: 'pending' }))).toEqual(AUCUN_GESTE);
  });

  it('AC1 — le Bailleur d’une demande en attente : Accepter, Refuser, Annuler, sans Contre-proposer', () => {
    const g = gestesDeLaReservation(reservation({ confirm: true, reject: true, cancel: true }, { kind: 'offer' }));

    expect(g).toMatchObject({ accepter: true, refuser: true, annuler: true, contreProposer: false });
  });

  it('suit `abilities` et rien d’autre : une demande en attente sans `confirm` ne se décide pas', () => {
    const g = gestesDeLaReservation(reservation({ cancel: true }));

    expect(g).toMatchObject({ accepter: false, refuser: false, annuler: true });
  });

  it('un séjour commencé : l’API retire `cancel`, la fiche n’a plus d’« Annuler » (TCK-1301)', () => {
    expect(gestesDeLaReservation(reservation({ cancel: false }, { status: 'confirmed', start_date: '2020-01-01' })).annuler).toBe(false);
  });

  it('« Créer le bail » sur `create_lease` seul', () => {
    expect(gestesDeLaReservation(reservation({ create_lease: true }, { kind: 'application', status: 'confirmed' })).creerLeBail).toBe(true);
    expect(gestesDeLaReservation(reservation({}, { kind: 'application', status: 'confirmed' })).creerLeBail).toBe(false);
  });

  describe('Enregistrer un paiement (`record_payment`)', () => {
    it('prend la barre sur un séjour confirmé', () => {
      expect(gestesDeLaReservation(reservation({ record_payment: true }, { status: 'confirmed' })).encaisser).toBe('principal');
    });

    it('reste un geste second ailleurs', () => {
      expect(gestesDeLaReservation(reservation({ record_payment: true })).encaisser).toBe('second');
      expect(gestesDeLaReservation(reservation({ record_payment: true }, { kind: 'application', status: 'confirmed' })).encaisser).toBe('second');
    });

    it('absent sans le droit', () => {
      expect(gestesDeLaReservation(reservation({}, { status: 'confirmed' })).encaisser).toBeNull();
    });
  });

  describe('Rembourser (`refund`, ex-`can_refund`)', () => {
    it('un séjour confirmé, tant qu’un paiement encaissé reste à rendre', () => {
      const sejour = { status: 'confirmed' as const, booking_payments: [PAYE] };

      expect(gestesDeLaReservation(reservation({ refund: true }, sejour)).rembourserLeSejour).toBe(true);
      expect(gestesDeLaReservation(reservation({ refund: false }, sejour)).rembourserLeSejour).toBe(false);
      expect(
        gestesDeLaReservation(reservation({ refund: true }, { ...sejour, booking_payments: [{ ...PAYE, refund_amount: 50_000, refundable: false }] }))
          .rembourserLeSejour,
      ).toBe(false);
    });

    it('une réservation fermée garde son bloc (`BookingRefundPanel`) : le geste suit `refund`', () => {
      const g = gestesDeLaReservation(reservation({ refund: true }, { status: 'cancelled', booking_payments: [PAYE] }));

      expect(g).toMatchObject({ rembourser: true, rembourserLeSejour: false });
    });
  });

  it('le dossier : le personnel demande, le client dépose (jamais les deux)', () => {
    const personnel = gestesDeLaReservation(reservation({ upload_dossier_piece: true, request_dossier_piece: true, manage_guarantors: true }));
    const client = gestesDeLaReservation(reservation({ upload_dossier_piece: true, manage_guarantors: true }));

    expect(personnel).toMatchObject({ demanderUnePiece: true, deposerUnePiece: false, gererLesGarants: true });
    expect(client).toMatchObject({ demanderUnePiece: false, deposerUnePiece: true, gererLesGarants: true });
  });

  it('les gestes du client : payer, répondre à la contre-offre, laisser un avis', () => {
    expect(gestesDeLaReservation(reservation({ pay: true, answer_counter_offer: true, leave_review: true }))).toMatchObject({
      payer: true,
      repondreALaContreOffre: true,
      laisserUnAvis: true,
    });
  });
});

describe('paiementsRemboursables', () => {
  // TCK-3007 — l'API en juge par paiement (`refundable`) : la fonction ne fait que la lire.
  it('les paiements que l’API dit remboursables à la main, et eux seuls', () => {
    const partiel = { ...PAYE, id: 2, refund_amount: 10_000 };
    const rendu = { ...PAYE, id: 3, refund_amount: 50_000, refundable: false };
    const attendu = { ...PAYE, id: 4, status: 'pending' as const, refundable: false };
    const plateforme = { ...PAYE, id: 5, refundable: false };
    const sansAvis = { ...PAYE, id: 6, refundable: undefined };

    expect(
      paiementsRemboursables({ booking_payments: [PAYE, partiel, rendu, attendu, plateforme, sansAvis] }).map((p) => p.id),
    ).toEqual([1, 2]);
  });
});
