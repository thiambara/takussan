/**
 * TCK-2877 — la fiche d'un séjour (maquette `app-reservations` a, e2, e5, e7) : les heures du bien
 * sous les dates (14:00 / 11:00 par défaut) et les voyageurs ; « Rembourser » d'un séjour CONFIRMÉ
 * payé, au téléphone dans « Autres gestes » et au bureau dans l'en-tête ; la carte « Nuits du bien »
 * au bureau ; le refus qui envoie `reason_code` et `message` ; la caution hors de l'encaissé.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import { ToastProvider } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { useBooking } from '@/lib/queries/bookings';
import { BookingDetail } from '../BookingDetail';
import { nuitsDuMois } from '../detail/nuits-du-bien';

const ecran = vi.hoisted(() => ({ telephone: true }));
const appels = vi.hoisted(() => ({ refus: vi.fn(), remboursement: vi.fn() }));
const nuits = vi.hoisted(() => ({ sejours: [] as unknown[], bloquees: [] as unknown[] }));
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => ecran.telephone }));
vi.mock('@/hooks/usePersonnelActif', () => ({ usePersonnelActif: () => true, useAgenceDuPersonnelActif: () => 5 }));
vi.mock('@/hooks/useMinuteCourante', () => ({ useMinuteCourante: () => new Date('2026-11-10T10:00:00Z') }));
vi.mock('@/lib/jour-de-l-api', async (importOriginal) => ({ ...(await importOriginal<object>()), jourDeLApi: () => '2026-11-10' }));
vi.mock('@/hooks/useCan', () => ({ useCanAll: () => ({ can: true, isLoading: false }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('@/hooks/usePaymentProviders', () => ({ usePaymentProviders: () => ({ providers: [] }) }));
vi.mock('@/lib/queries/nuits-du-bien', () => ({
  useSejoursDuBien: () => ({ data: { data: nuits.sejours }, isLoading: false, isError: false }),
  useNuitsBloqueesDuBien: () => ({ data: { data: nuits.bloquees }, isLoading: false, isError: false }),
}));
vi.mock('@/lib/queries/bookings', () => ({
  useBooking: vi.fn(),
  useCancelBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useConfirmBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRejectBooking: () => ({ mutateAsync: appels.refus, isPending: false }),
  useCreateBookingPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRefundBookingPayment: () => ({ mutateAsync: appels.remboursement, isPending: false }),
}));

/** Le séjour de la maquette (e5) : Awa Diop, 12 → 15 nov., acompte de 49 500 F payé. */
const SEJOUR = {
  id: 8,
  agency_id: 5,
  kind: 'stay',
  status: 'confirmed',
  reference_number: 'SEJ-2611-0118',
  total_amount: 165_000,
  deposit_amount: 49_500,
  price_at_booking: 55_000,
  currency: 'XOF',
  start_date: '2026-11-12',
  end_date: '2026-11-15',
  guests: 2,
  created_at: '2026-11-06T16:40:00Z',
  confirmed_at: '2026-11-06T17:05:00Z',
  can_refund: true,
  customer_id: 3,
  customer: { id: 3, user_id: 40, first_name: 'Awa', last_name: 'Diop', phone: '+221774513680' },
  property: { id: 9, title: 'Appartement vue mer', slug: 'appartement', price: 55_000, currency: 'XOF', contract_type: 'rent', rent_period: 'daily', location: { quarter: 'Ngor' }, main_photo_url: null },
  booking_payments: [
    { id: 61, amount: 49_500, currency: 'XOF', payment_type: 'deposit', payment_method: 'orange_money', status: 'paid', paid_at: '2026-11-06T18:42:00Z', payment_date: '2026-11-06T18:42:00Z', created_at: '2026-11-06T18:40:00Z' },
  ],
  notes: null,
};

const texte = (el: Element) => (el.textContent ?? '').replace(/[  ]/g, ' ');
const montant = (t: string) => new RegExp(t.replace(/ /g, '[\\s\\u00a0\\u202f]'));

function rendre(booking: Record<string, unknown>, userId = 3) {
  vi.mocked(useAuth).mockReturnValue({ user: { id: userId, roles: ['agent'] }, token: 'tok' } as unknown as ReturnType<typeof useAuth>);
  vi.mocked(useBooking).mockReturnValue({ data: { data: booking }, isLoading: false, isError: false } as unknown as ReturnType<typeof useBooking>);
  return render(
    withIntl(
      <ToastProvider>
        <BookingDetail bookingId={Number(booking.id)} />
      </ToastProvider>,
    ),
  );
}

beforeEach(() => {
  ecran.telephone = true;
  nuits.sejours = [];
  nuits.bloquees = [];
  appels.refus.mockReset().mockResolvedValue({});
  appels.remboursement.mockReset().mockResolvedValue({});
});

describe('TCK-2877 — dates du séjour : heures et voyageurs', () => {
  it('AC1 — un bien sans heures dit « à partir de 14:00 » et « avant 11:00 » ; « 3 nuits · 2 voyageurs »', () => {
    rendre(SEJOUR);
    const dates = document.querySelector('[data-slot="dates-du-sejour"]')!;
    expect(texte(dates)).toContain('à partir de 14:00');
    expect(texte(dates)).toContain('avant 11:00');
    expect(texte(dates)).toContain('3 nuits · 2 voyageurs');
  });

  it('AC1 — un bien `check_in_from = 15:00` dit « à partir de 15:00 » ; sans voyageurs, les nuits seules', () => {
    rendre({ ...SEJOUR, guests: null, property: { ...SEJOUR.property, check_in_from: '15:00', check_out_before: '10:30' } });
    const dates = document.querySelector('[data-slot="dates-du-sejour"]')!;
    expect(texte(dates)).toContain('à partir de 15:00');
    expect(texte(dates)).toContain('avant 10:30');
    expect(texte(dates)).not.toContain('voyageur');
    expect(texte(dates)).toContain('3 nuits');
  });
});

describe('TCK-2877 — « Rembourser » un séjour confirmé', () => {
  it('AC2 — au téléphone, dans « Autres gestes » : la feuille dit « Au plus 49 500 F » et « Rembourser 49 500 F »', async () => {
    rendre(SEJOUR);
    fireEvent.click(screen.getByRole('button', { name: fr.bookings.fiche.gestes.rembourser }));
    const feuille = screen.getByRole('dialog');
    expect(within(feuille).getByText('Rembourser Awa Diop')).toBeInTheDocument();
    expect(within(feuille).getByText(montant('Au plus 49 500 F : ce que Awa a payé.'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: montant('Rembourser 49 500 F') }));
    await waitFor(() => expect(appels.remboursement).toHaveBeenCalledTimes(1));
    expect(appels.remboursement.mock.calls[0]![0]).toMatchObject({ paymentId: 61, refund_amount: 49_500 });
  });

  it('au bureau, dans l’en-tête, entre « Annuler le séjour » et « Enregistrer un paiement »', () => {
    ecran.telephone = false;
    rendre(SEJOUR);
    const gestes = screen.getAllByRole('button').map((b) => b.textContent?.trim());
    const i = gestes.indexOf(fr.bookings.fiche.gestes.rembourser);
    expect(i).toBeGreaterThan(gestes.indexOf('Annuler le séjour'));
    expect(i).toBeLessThan(gestes.indexOf(fr.bookings.paymentDialog.title));
  });

  it('absent sans paiement encaissé, sans `can_refund`, sur un paiement entièrement remboursé, et pour le client', () => {
    const { unmount } = rendre({ ...SEJOUR, booking_payments: [{ ...SEJOUR.booking_payments[0], status: 'pending' }] });
    expect(screen.queryByRole('button', { name: fr.bookings.fiche.gestes.rembourser })).toBeNull();
    unmount();
    const r2 = rendre({ ...SEJOUR, can_refund: false });
    expect(screen.queryByRole('button', { name: fr.bookings.fiche.gestes.rembourser })).toBeNull();
    r2.unmount();
    const r3 = rendre({ ...SEJOUR, booking_payments: [{ ...SEJOUR.booking_payments[0], refund_amount: 49_500 }] });
    expect(screen.queryByRole('button', { name: fr.bookings.fiche.gestes.rembourser })).toBeNull();
    r3.unmount();
    rendre(SEJOUR, 40);
    expect(screen.queryByRole('button', { name: fr.bookings.fiche.gestes.rembourser })).toBeNull();
  });

  it('absent d’un séjour en attente (le remboursement d’une réservation fermée reste à son bloc)', () => {
    rendre({ ...SEJOUR, status: 'pending' });
    expect(screen.queryByRole('button', { name: fr.bookings.fiche.gestes.rembourser })).toBeNull();
  });
});

describe('TCK-2877 — encaissé : la caution n’est pas un règlement du séjour', () => {
  it('une caution payée ne réduit pas le solde', () => {
    rendre({
      ...SEJOUR,
      booking_payments: [
        ...SEJOUR.booking_payments,
        { id: 62, amount: 100_000, currency: 'XOF', payment_type: 'security_deposit', payment_method: 'cash', status: 'paid', paid_at: '2026-11-07T10:00:00Z', created_at: '2026-11-07T10:00:00Z' },
      ],
    });
    expect(texte(document.body)).toMatch(montant('49 500 F reçus sur 165 000 F'));
    expect(texte(document.body)).not.toMatch(montant('149 500 F reçus'));
  });
});

describe('TCK-2877 — la carte « Nuits du bien » au bureau', () => {
  it('nuitsDuMois — novembre de la maquette : 3 nuits à ce séjour, 6 aux autres, 2 en attente, 19 libres', () => {
    const r = nuitsDuMois(
      '2026-11-01',
      { debut: '2026-11-12', fin: '2026-11-15' },
      [
        { debut: '2026-11-03', fin: '2026-11-07' },
        { debut: '2026-11-27', fin: '2026-11-29' },
      ],
      [],
      [{ debut: '2026-11-20', fin: '2026-11-22' }],
    );
    const compte = (e: string) => [...r.etats.values()].filter((x) => x === e).length;
    expect([compte('ceSejour'), compte('autres'), compte('enAttente'), r.libres]).toEqual([3, 6, 2, 19]);
    // Le jour du départ reste libre (ADR-0041).
    expect(r.etats.get('2026-11-15')).toBe('libre');
  });

  it('une nuit bloquée par le bailleur n’est pas libre', () => {
    const r = nuitsDuMois('2026-11-01', { debut: '2026-11-12', fin: '2026-11-15' }, [], [{ debut: '2026-11-01', fin: '2026-11-03' }], []);
    expect(r.etats.get('2026-11-02')).toBe('bloquee');
    expect(r.libres).toBe(30 - 3 - 2);
  });

  it('AC3 — à 1440, « Nuits du bien · novembre » : ce séjour, les autres, les demandes en attente hachurées, les nuits libres', () => {
    ecran.telephone = false;
    nuits.sejours = [
      { id: 8, status: 'confirmed', start_date: '2026-11-12', end_date: '2026-11-15' },
      { id: 20, status: 'confirmed', start_date: '2026-11-03', end_date: '2026-11-07' },
      { id: 21, status: 'confirmed', start_date: '2026-10-30', end_date: '2026-11-02' },
      { id: 22, status: 'pending', start_date: '2026-11-20', end_date: '2026-11-22' },
    ];
    rendre(SEJOUR);
    expect(screen.getByRole('heading', { name: 'Nuits du bien · novembre' })).toBeInTheDocument();
    const carte = document.querySelector('[data-slot="nuits-du-bien"]')!;
    const etats = [...carte.querySelectorAll('[data-etat]')].map((n) => n.getAttribute('data-etat'));
    expect(etats).toHaveLength(30);
    expect(etats.filter((e) => e === 'ceSejour')).toHaveLength(3);
    // 3 → 6 nov., et le 1er novembre du séjour à cheval sur octobre.
    expect(etats.filter((e) => e === 'autres')).toHaveLength(5);
    expect(etats.filter((e) => e === 'enAttente')).toHaveLength(2);
    expect(texte(carte)).toContain('20 nuits libres ce mois-ci.');
    expect(within(carte as HTMLElement).getByText('En attente')).toBeInTheDocument();
  });

  it('jamais au téléphone', () => {
    rendre(SEJOUR);
    expect(document.querySelector('[data-slot="nuits-du-bien"]')).toBeNull();
  });
});

describe('TCK-2877 — le refus envoie le motif codé et le message', () => {
  it('AC4 — « Dossier incomplet » et « Il manque l’engagement du garant » partent en `reason_code` et `message`', async () => {
    rendre({ ...SEJOUR, kind: 'application', status: 'pending', start_date: '2026-12-01', end_date: null, booking_payments: [] });
    fireEvent.click(screen.getAllByRole('button', { name: fr.bookings.detail.actions.reject })[0]!);
    const feuille = screen.getByRole('dialog');
    fireEvent.click(within(feuille).getByRole('radio', { name: 'Dossier incomplet' }));
    fireEvent.change(within(feuille).getByRole('textbox', { name: 'Message à Awa' }), { target: { value: 'Il manque l’engagement du garant' } });
    expect(texte(feuille)).toContain('Le motif lui est transmis avec ce message.');
    fireEvent.click(screen.getByRole('button', { name: 'Refuser et prévenir Awa' }));
    await waitFor(() => expect(appels.refus).toHaveBeenCalledTimes(1));
    expect(appels.refus.mock.calls[0]![0]).toEqual({
      reason: 'Dossier incomplet — Il manque l’engagement du garant',
      reason_code: 'incomplete_file',
      message: 'Il manque l’engagement du garant',
    });
  });
});
