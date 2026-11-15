/**
 * TCK-2594 — la fiche d'une réservation dans les mots de sa nature (ADR-0102) : Qui (le client, son
 * numéro, Appeler / WhatsApp / Fiche), Quoi (l'offre face au prix affiché, les nuits et l'encaissement
 * d'un séjour, le loyer d'une candidature), la Suite (au téléphone dans la barre collante, au bureau
 * dans l'en-tête), le moyen de paiement en clair et le « Reçu ».
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import { ToastProvider } from '@/components/ui/toast';
import { PAYMENT_METHOD_VALUES } from '@/components/payments/constants';
import { useAuth } from '@/context/AuthContext';
import { useBooking } from '@/lib/queries/bookings';
import { BookingDetail } from '../BookingDetail';

const ecran = vi.hoisted(() => ({ telephone: false, personnel: true }));
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => ecran.telephone }));
vi.mock('@/hooks/usePersonnelActif', () => ({ usePersonnelActif: () => ecran.personnel, useAgenceDuPersonnelActif: () => 5 }));
vi.mock('@/hooks/useMinuteCourante', () => ({ useMinuteCourante: () => new Date('2026-11-12T10:00:00Z') }));
vi.mock('@/hooks/useCan', () => ({ useCanAll: () => ({ can: true, isLoading: false }) }));
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

/** L'offre de la maquette (« Offre », a-4). */
const OFFRE = {
  id: 7,
  agency_id: 5,
  kind: 'offer',
  status: 'pending',
  reference_number: 'OFF-2611-0007',
  total_amount: 85_000_000,
  list_price_at_booking: 95_000_000,
  currency: 'XOF',
  created_at: '2026-11-11T16:40:00Z',
  offer_expires_at: '2026-11-16T12:00:00Z',
  expires_at: '2026-11-18T12:00:00Z',
  customer_id: 3,
  customer: { id: 3, user_id: 40, first_name: 'Ibrahima', last_name: 'Sarr', phone: '+221765402791', occupation: 'Entrepreneur' },
  visits_on_property: 2,
  property: { id: 9, title: 'Villa', slug: 'villa', price: 95_000_000, currency: 'XOF', contract_type: 'sale', location: { quarter: 'Almadies' }, main_photo_url: null },
  booking_payments: [],
  notes: 'La toiture de la terrasse est à reprendre.',
};

/** Le séjour de la maquette (« Séjour », a-5) : 3 nuits, acompte de 30 % payé par Orange Money. */
const SEJOUR = {
  ...OFFRE,
  id: 8,
  kind: 'stay',
  status: 'confirmed',
  reference_number: 'SEJ-2611-0118',
  total_amount: 165_000,
  deposit_amount: 49_500,
  price_at_booking: 55_000,
  list_price_at_booking: null,
  start_date: '2026-11-12',
  end_date: '2026-11-15',
  confirmed_at: '2026-11-06T17:05:00Z',
  customer: { id: 3, user_id: 40, first_name: 'Awa', last_name: 'Diop', phone: '+221774513680' },
  property: { ...OFFRE.property, title: 'Appartement vue mer', price: 55_000, contract_type: 'rent', location: { quarter: 'Ngor' } },
  booking_payments: [
    { id: 61, amount: 49_500, currency: 'XOF', payment_type: 'deposit', payment_method: 'orange_money', status: 'paid', transaction_id: 'OM-48213907', paid_at: '2026-11-06T18:42:00Z', payment_date: '2026-11-06T18:42:00Z', created_at: '2026-11-06T18:40:00Z' },
  ],
  notes: null,
};

/** La candidature acceptée (« Acceptée — créer le bail », a-3). */
const CANDIDATURE_ACCEPTEE = {
  ...OFFRE,
  id: 42,
  kind: 'application',
  status: 'confirmed',
  reference_number: 'CAN-2611-0042',
  total_amount: 300_000,
  list_price_at_booking: null,
  start_date: '2026-12-01',
  confirmed_at: '2026-11-12T11:20:00Z',
  customer: { id: 3, user_id: 40, first_name: 'Ousmane', last_name: 'Ba', phone: '+221775120844' },
  property: { ...OFFRE.property, title: 'F3', price: 300_000, contract_type: 'rent', location: { quarter: 'Sacré-Cœur 3' } },
};

const texte = (el: HTMLElement) => (el.textContent ?? '').replace(/[  ]/g, ' ');

function rendre(booking: Record<string, unknown>, roles: readonly string[] = ['agent'], userId = 3) {
  vi.mocked(useAuth).mockReturnValue({ user: { id: userId, roles }, token: 'tok' } as unknown as ReturnType<typeof useAuth>);
  vi.mocked(useBooking).mockReturnValue({ data: { data: booking }, isLoading: false, isError: false } as unknown as ReturnType<typeof useBooking>);
  return render(
    withIntl(
      <ToastProvider>
        <BookingDetail bookingId={Number(booking.id)} />
      </ToastProvider>,
    ),
  );
}

describe('BookingDetail — trois natures (TCK-2594)', () => {
  beforeEach(() => {
    ecran.telephone = false;
    ecran.personnel = true;
  });

  it('AC2 — l’offre se lit face au prix affiché : « 85 000 000 F », « 95 000 000 F », « −10 000 000 F · −10,5 % »', () => {
    rendre(OFFRE);
    expect(screen.getByRole('heading', { level: 1, name: 'Offre d’Ibrahima Sarr' })).toBeInTheDocument();
    const comparaison = document.querySelector<HTMLElement>('[data-slot="comparaison-de-l-offre"]')!;
    expect(texte(comparaison)).toContain('85 000 000 F');
    expect(texte(comparaison)).toContain(`${fr.bookings.fiche.offre.prixAffiche}95 000 000 F`);
    expect(texte(comparaison)).toContain('−10 000 000 F · −10,5 %');
    expect(texte(document.body)).toContain('L’offre est à 10,5 % sous le prix affiché.');
    // L'offre en attente dit son échéance (« Valable jusqu’au »), pas « Expire le ».
    expect(screen.getByText(fr.bookings.fiche.quoi.valable)).toBeInTheDocument();
    expect(screen.queryByText(fr.bookings.detail.expiresAt)).toBeNull();
  });

  it('Qui : le nom, le numéro, Appeler / WhatsApp / Fiche ; la visite passée sur ce bien', () => {
    rendre(OFFRE);
    const qui = document.querySelector<HTMLElement>('[data-slot="bloc-qui"]')!;
    expect(texte(qui)).toContain('Ibrahima Sarr');
    expect(texte(qui)).toContain('+221 76 540 27 91');
    expect(within(qui).getByRole('link', { name: /Appeler/ })).toHaveAttribute('href', 'tel:+221765402791');
    expect(within(qui).getByRole('link', { name: /WhatsApp/ }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/221765402791\?text=Bonjour%20Ibrahima/);
    expect(within(qui).getByRole('link', { name: /Fiche/ })).toHaveAttribute('href', '/app/customers/3');
    expect(texte(qui)).toContain(fr.bookings.fiche.qui.dejaVisite);
    expect(texte(qui)).toContain('Entrepreneur');
  });

  it('le bailleur lit un numéro masqué : ni Appeler, ni WhatsApp, ni Fiche', () => {
    ecran.personnel = false;
    rendre({ ...OFFRE, customer: { ...OFFRE.customer, phone: '+221 7•• ••• •• 91' } }, ['owner']);
    const qui = document.querySelector<HTMLElement>('[data-slot="bloc-qui"]')!;
    expect(within(qui).queryByRole('link')).toBeNull();
  });

  it('le client ne lit pas de bloc « Qui » : c’est lui', () => {
    rendre(OFFRE, ['customer'], 40);
    expect(document.querySelector('[data-slot="bloc-qui"]')).toBeNull();
  });

  it('un séjour compte ses nuits et son encaissement ; le moyen se dit en clair, le reçu s’appelle « Reçu »', () => {
    rendre(SEJOUR);
    const page = texte(document.body);
    expect(page).toContain('3 nuits × 55 000 F');
    expect(page).toContain('Acompte (30 %)');
    expect(page).toContain('115 500 F');
    expect(page).toContain('49 500 F reçus sur 165 000 F');
    const paiement = document.querySelector<HTMLElement>('[data-slot="ligne-de-paiement"]')!;
    expect(texte(paiement)).toContain('Orange Money');
    expect(texte(paiement)).not.toContain('orange_money');
    expect(texte(paiement)).toContain('Réf. OM-48213907');
    expect(within(paiement).getByRole('button', { name: 'Reçu PDF' })).toBeInTheDocument();
    expect(fr.bookings.detail.receipt).not.toMatch(/Quittance/);
    // Au bureau, l'encaissement d'un séjour confirmé est le geste principal de l'en-tête.
    expect(screen.getByRole('button', { name: fr.bookings.paymentDialog.title })).toBeInTheDocument();
  });

  it('chaque moyen de paiement de l’API a son libellé (aucun ne s’affiche brut)', () => {
    for (const m of PAYMENT_METHOD_VALUES) {
      expect(fr.payments.methods[m], m).toBeTruthy();
      expect(fr.payments.methods[m]).not.toBe(m);
    }
  });

  it('au téléphone, la suite est dans la barre collante : Refuser et Accepter, une seule fois', () => {
    ecran.telephone = true;
    rendre(OFFRE);
    const barre = document.querySelector<HTMLElement>('[data-slot="barre-d-action"]')!;
    expect(within(barre).getAllByRole('button').map((b) => b.textContent)).toEqual([fr.bookings.detail.actions.reject, fr.bookings.detail.actions.accept]);
    expect(screen.getAllByRole('button', { name: fr.bookings.detail.actions.accept })).toHaveLength(1);
  });

  it('une candidature acceptée mène au bail : la suite le dit, la barre le crée ; « Annuler » passe aux autres gestes', () => {
    ecran.telephone = true;
    rendre(CANDIDATURE_ACCEPTEE);
    const suite = document.querySelector<HTMLElement>('[data-slot="suite-du-bail"]')!;
    expect(texte(suite)).toContain(fr.bookings.fiche.suiteBail.titre);
    expect(texte(suite)).toContain('Ousmane Ba');
    expect(texte(suite)).toContain('300 000 F/mois');
    const barre = document.querySelector<HTMLElement>('[data-slot="barre-d-action"]')!;
    expect(within(barre).getByRole('link', { name: fr.bookings.detail.actions.createLease })).toHaveAttribute('href', '/app/leases/new?booking_id=42');
    expect(screen.getByRole('button', { name: /Annuler la réservation/ })).not.toBeNull();
    expect(texte(document.body)).toContain('Candidature · acceptée à 11:20');
  });

  it('au bureau, le titre nomme la nature et le client ; le fil remonte à la nature', () => {
    rendre(CANDIDATURE_ACCEPTEE);
    expect(screen.getByRole('heading', { level: 1, name: 'Candidature d’Ousmane Ba' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: fr.dashboard.pages.bookings.title })).toHaveAttribute('href', '/app/bookings');
    expect(screen.getByRole('link', { name: fr.bookings.liste.natures.application })).toHaveAttribute('href', '/app/bookings?kind=application');
    expect(screen.getByRole('link', { name: fr.bookings.detail.actions.createLease })).toBeInTheDocument();
  });

  it('au bureau, une demande à décider ne montre que la décision en tête ; « Annuler » et l’encaissement passent dans « Autres gestes »', () => {
    rendre(OFFRE);
    const carte = screen.getByRole('heading', { name: /Autres gestes/ }).closest('section')!;
    expect(within(carte).getByRole('button', { name: 'Annuler la réservation' })).toBeInTheDocument();
    expect(within(carte).getByRole('button', { name: fr.bookings.paymentDialog.title })).toBeInTheDocument();
    // Une seule fois chacun : rien ne reste dans l'en-tête.
    expect(screen.getAllByRole('button', { name: 'Annuler la réservation' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: fr.bookings.paymentDialog.title })).toHaveLength(1);
  });

  it('au bureau, la carte « Décision » d’une offre à décider porte « Accepter 85 000 000 F » et « Refuser », qui ouvrent la décision', async () => {
    rendre(OFFRE);
    const carte = document.querySelector<HTMLElement>('[data-slot="gestes-de-la-decision"]')!;
    const accepter = within(carte).getByRole('button', { name: /^Accepter 85\s000\s000\sF$/ });
    fireEvent.click(within(carte).getByRole('button', { name: fr.bookings.detail.actions.reject }));
    // La feuille de refus, dans les mots de l'offre : son titre et ses motifs en pastilles.
    const feuille = await screen.findByRole('dialog');
    expect(feuille).toHaveTextContent('Refuser l’offre');
    expect(within(feuille).getByRole('radio', { name: 'Offre trop basse' })).toBeInTheDocument();
    expect(within(feuille).getByRole('button', { name: 'Refuser et prévenir Ibrahima' })).toBeDisabled();
    expect(accepter).toBeInTheDocument();
  });

  it('« Enregistrer un paiement » d’un séjour s’ouvre prérempli du reste, en « Solde » une fois l’acompte payé', async () => {
    rendre(SEJOUR);
    fireEvent.click(screen.getByRole('button', { name: fr.bookings.paymentDialog.title }));
    const feuille = await screen.findByRole('dialog');
    expect(within(feuille).getByLabelText(new RegExp(`^${fr.bookings.feuilles.paiement.montant}`))).toHaveDisplayValue(/^115[\s\u00a0\u202f]?500$/);
    expect(within(feuille).getByRole('button', { name: /^Enregistrer 115[\s\u00a0\u202f]500[\s\u00a0\u202f]F$/ })).toBeInTheDocument();
    expect(within(feuille).getByRole('radio', { name: 'Solde' })).toBeChecked();
  });

  it('une offre déjà acceptée n’a plus de carte « Décision »', () => {
    rendre({ ...OFFRE, status: 'confirmed' });
    expect(document.querySelector('[data-slot="gestes-de-la-decision"]')).toBeNull();
  });
});
