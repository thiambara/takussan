import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// TCK-3007 (vérification adverse) — le panneau de remboursement décide de son geste par la fonction pure
// de la fiche (`gestesDeLaReservation(...).rembourser`), pas en relisant `abilities.refund` à côté d'elle :
// on la double, et le panneau doit suivre CE QU'ELLE REND, même contre `abilities`.
const gestes = vi.hoisted(() => ({ rembourser: false }));
vi.mock('../detail/gestes', async (original) => {
  const vrai = await original<typeof import('../detail/gestes')>();
  return {
    ...vrai,
    gestesDeLaReservation: (b: Parameters<typeof vrai.gestesDeLaReservation>[0]) => ({
      ...vrai.gestesDeLaReservation(b),
      rembourser: gestes.rembourser,
    }),
  };
});
vi.mock('@/lib/queries/bookings', () => ({
  useRefundBookingPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { withIntl } from '@/test/intl';
import { permis } from './abilities-de-test';
import { BookingRefundPanel } from '../BookingRefundPanel';
import type { Booking } from '@/types/booking';

function reservation(refund: boolean, refundable = true): Booking {
  return {
    id: 1,
    status: 'cancelled',
    refund_status: 'pending',
    abilities: refund ? permis('refund') : permis(),
    booking_payments: [
      { id: 41, booking_id: 1, amount: 15000, currency: 'XOF', payment_type: 'deposit', status: 'paid', created_at: '2026-10-01T10:00:00Z', refundable },
    ],
  } as unknown as Booking;
}

function monter(booking: Booking) {
  render(withIntl(<BookingRefundPanel booking={booking} locale="fr" isCustomer={false} />));
}

describe('BookingRefundPanel — le geste lu par la fonction pure (TCK-3007)', () => {
  it('pas de geste quand la fonction pure le refuse, même si abilities.refund est vrai', () => {
    gestes.rembourser = false;
    monter(reservation(true));
    expect(screen.getByTestId('booking-refund-panel')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('le geste quand la fonction pure le permet', () => {
    gestes.rembourser = true;
    monter(reservation(false));
    expect(screen.queryAllByRole('button').length).toBeGreaterThan(0);
  });

  it('pas de bouton sur un paiement que l’API dit non remboursable à la main (soldé par la plateforme)', () => {
    gestes.rembourser = true;
    monter(reservation(true, false));
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
