/**
 * TCK-2879 — la fiche, côté CLIENT, au bout des gestes de sa carte : `#paiement` porte « Payer
 * l'acompte » d'un séjour (jamais celui d'une offre ou d'une candidature), `#dossier` la section Dossier
 * d'une candidature, la contre-offre y reçoit sa réponse, et l'ancre de l'URL y descend une fois lue.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import { ToastProvider } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { useBooking } from '@/lib/queries/bookings';
import { BookingDetail } from '../BookingDetail';

// TCK-2963 — le bloc de la salle ouvre sa conversation (React Query) : hors du propos de ce test.
vi.mock('@/components/messages/salle/BlocDeLaSalle', () => ({ BlocDeLaSalle: () => null }));
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => true }));
vi.mock('@/hooks/usePersonnelActif', () => ({ usePersonnelActif: () => false, useAgenceDuPersonnelActif: () => null }));
vi.mock('@/hooks/useMinuteCourante', () => ({ useMinuteCourante: () => new Date('2026-11-15T10:00:00Z') }));
vi.mock('@/hooks/useCan', () => ({ useCanAll: () => ({ can: false, isLoading: false }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('@/hooks/usePaymentProviders', () => ({ usePaymentProviders: () => ({ providers: [] }) }));
vi.mock('@/lib/queries/bookings', () => ({
  useBooking: vi.fn(),
  useCancelBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useConfirmBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRejectBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateBookingPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRefundBookingPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
const geste = vi.hoisted(() => ({ repondre: vi.fn() }));
vi.mock('@/lib/queries/booking-gestes-du-client', () => ({
  PIECE_DU_DOSSIER_ACCEPT: 'application/pdf',
  PIECE_DU_DOSSIER_MAX_OCTETS: 10 * 1024 * 1024,
  useDeposerUnePiece: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRepondreALaContreOffre: () => ({ mutateAsync: geste.repondre, isPending: false }),
}));
const DOSSIER_3_SUR_4 = {
  data: {
    received: 3,
    required: 4,
    missing: ['employment_certificate'],
    pieces: [{ piece: 'employment_certificate', required: true, received: false, received_at: null, requested_at: null, document: null }],
  },
};
vi.mock('@/lib/queries/booking-dossier', () => ({
  useDossierDeLaReservation: () => ({ data: DOSSIER_3_SUR_4, isPending: false, isError: false, refetch: vi.fn() }),
  useDemanderUnePiece: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAutresCandidaturesDuBien: () => ({ data: { data: [] } }),
  useVisitesDuClient: () => ({ data: { data: [] } }),
}));
vi.mock('@/lib/queries/booking-counter-offer', () => ({ useContreProposer: () => ({ mutateAsync: vi.fn(), isPending: false }) }));

const BASE = {
  agency_id: 5,
  status: 'confirmed',
  reference_number: 'RES-1',
  currency: 'XOF',
  created_at: '2026-11-01T10:00:00Z',
  customer_id: 3,
  customer: { id: 3, user_id: 40, first_name: 'Awa', last_name: 'Diop' },
  booking_payments: [],
  counter_offer: null,
  awaiting: null,
};
const SEJOUR = {
  ...BASE, id: 1, kind: 'stay', total_amount: 110_000, deposit_amount: 33_000, start_date: '2026-11-19', end_date: '2026-11-21',
  property: { id: 9, title: 'Duplex vue mer', slug: 'duplex', price: 55_000, currency: 'XOF', contract_type: 'short_term', location: { quarter: 'Ngor' }, main_photo_url: null },
};
const OFFRE = {
  ...BASE, id: 4, kind: 'offer', status: 'pending', total_amount: 85_000_000, list_price_at_booking: 95_000_000, awaiting: 'customer',
  counter_offer: { id: 9, amount: 90_000_000, message: null, valid_until: '2026-11-18', status: 'pending', created_at: '2026-11-14T10:00:00Z', responded_at: null },
  property: { id: 10, title: 'Appartement F4', slug: 'f4', price: 95_000_000, currency: 'XOF', contract_type: 'sale', location: { quarter: 'Almadies' }, main_photo_url: null },
};
const CANDIDATURE = {
  ...BASE, id: 3, kind: 'application', status: 'pending', total_amount: 380_000, dossier: { received: 3, required: 4, missing: ['employment_certificate'] },
  property: { id: 11, title: 'Deux-pièces rénové', slug: 'deux', price: 380_000, currency: 'XOF', contract_type: 'rent', location: { quarter: 'Point E' }, main_photo_url: null },
};

function rendre(booking: Record<string, unknown>) {
  vi.mocked(useAuth).mockReturnValue({ user: { id: 40, roles: ['customer'] }, token: 'tok' } as unknown as ReturnType<typeof useAuth>);
  vi.mocked(useBooking).mockReturnValue({ data: { data: booking }, isLoading: false, isError: false } as unknown as ReturnType<typeof useBooking>);
  return render(
    withIntl(
      <ToastProvider>
        <BookingDetail bookingId={Number(booking.id)} />
      </ToastProvider>,
    ),
  );
}

describe('BookingDetail — le client au bout des gestes de sa carte (TCK-2879)', () => {
  beforeEach(() => {
    geste.repondre.mockReset();
  });
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('séjour : « Payer l’acompte » sous `#paiement`', () => {
    rendre(SEJOUR);
    const paiement = document.getElementById('paiement')!;
    expect(within(paiement).getByRole('button', { name: fr.bookings.detail.payCta.deposit })).toBeInTheDocument();
  });

  it('un paiement déjà en attente (retour de la passerelle) : `#paiement` est la section Paiements, où il se règle', () => {
    rendre({ ...SEJOUR, booking_payments: [{ id: 77, amount: 33_000, currency: 'XOF', payment_type: 'deposit', status: 'pending', created_at: '2026-11-15T09:00:00Z' }] });
    const paiement = document.getElementById('paiement')!;
    expect(paiement.tagName).toBe('SECTION');
    expect(within(paiement).getByRole('heading', { name: new RegExp(fr.bookings.fiche.sections.paiements) })).toBeInTheDocument();
    expect(document.querySelectorAll('#paiement')).toHaveLength(1);
  });

  it('offre : ni acompte ni solde à payer (son montant est un prix) ; la contre-offre se répond ici', async () => {
    rendre(OFFRE);
    expect(screen.queryByRole('button', { name: fr.bookings.detail.payCta.balance })).toBeNull();
    expect(screen.queryByRole('button', { name: fr.bookings.detail.payCta.deposit })).toBeNull();
    const paiement = document.getElementById('paiement')!;
    fireEvent.click(within(paiement).getByRole('button', { name: fr.bookings.client.actions.accepter }));
    await waitFor(() => expect(geste.repondre).toHaveBeenCalledWith({ contreOffreId: 9, reponse: 'accept' }));
  });

  it('candidature : la section Dossier porte l’ancre `#dossier`, et la fiche y descend une fois lue', () => {
    const descendre = vi.fn();
    const avant = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = descendre;
    window.history.replaceState(null, '', '/app/bookings/3#dossier');
    try {
      rendre(CANDIDATURE);
      const dossier = document.getElementById('dossier')!;
      expect(dossier.tagName).toBe('SECTION');
      expect(descendre).toHaveBeenCalledTimes(1);
      expect(descendre.mock.contexts[0]).toBe(dossier);
      // Ouverte : la pièce manquante se dépose.
      expect(within(dossier).getAllByRole('button', { name: /^(Prendre une photo|Déposer un fichier) : / }).length).toBeGreaterThan(0);
    } finally {
      Element.prototype.scrollIntoView = avant;
    }
  });

  it('candidature refusée : le dossier se lit, plus rien ne s’y dépose (l’API le refuserait)', () => {
    rendre({ ...CANDIDATURE, status: 'rejected' });
    const dossier = document.getElementById('dossier')!;
    expect(within(dossier).queryByRole('button', { name: /^(Prendre une photo|Déposer un fichier) : / })).toBeNull();
  });
});
