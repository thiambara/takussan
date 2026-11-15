/**
 * TCK-2876 (ADR-0110 § 1 et 5, maquette `app-reservations` a, e4 « Offre ») — la fiche d'une offre
 * d'achat : « Contre-proposer » (barre du téléphone, en-tête et carte « Décision » du bureau) et sa
 * feuille, la contre-offre en cours en tête du Quoi et dans l'historique, le financement, le délai de
 * signature et les conditions, et « · N visites · première offre reçue ».
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import { ToastProvider } from '@/components/ui/toast';
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
vi.mock('@/lib/queries/booking-dossier', () => ({
  useDossierDeLaReservation: () => ({ data: undefined, isPending: true, isError: false, refetch: vi.fn() }),
  useDemanderUnePiece: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAutresCandidaturesDuBien: () => ({ data: { data: [] } }),
  useVisitesDuClient: () => ({ data: { data: [] } }),
}));
const geste = vi.hoisted(() => ({ contreProposer: vi.fn() }));
vi.mock('@/lib/queries/booking-counter-offer', () => ({
  useContreProposer: () => ({ mutateAsync: geste.contreProposer, isPending: false }),
}));

/** L'offre de la maquette (e4) : 85 000 000 F sur 95 000 000 F, comptant, signature sous 30 jours. */
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
  customer: { id: 3, user_id: 40, first_name: 'Ibrahima', last_name: 'Sarr', phone: '+221765402791' },
  property: { id: 9, title: 'Villa', slug: 'villa', price: 95_000_000, currency: 'XOF', contract_type: 'sale', location: { quarter: 'Almadies' }, main_photo_url: null, published_at: '2026-09-26T10:00:00Z' },
  booking_payments: [],
  notes: 'La toiture de la terrasse est à reprendre.',
  financing: 'cash',
  signature_within_days: 30,
  conditions: 'Aucune',
  property_visits_count: 6,
  offer_rank: 1,
  counter_offer: null,
  awaiting: 'agency',
};

const CANDIDATURE = {
  ...OFFRE,
  id: 42,
  kind: 'application',
  total_amount: 300_000,
  list_price_at_booking: null,
  financing: null,
  signature_within_days: null,
  conditions: null,
  property: { ...OFFRE.property, price: 300_000, contract_type: 'rent' },
};

/** La contre-offre envoyée : 90 000 000 F, valable jusqu'au dim. 15 nov. (J+3). */
const CONTRE_OFFRE = {
  id: 501,
  amount: 90_000_000,
  message: 'Le prix tient compte de la toiture.',
  valid_until: '2026-11-15',
  status: 'pending',
  created_at: '2026-11-12T09:30:00Z',
  responded_at: null,
};

const texte = (el: Element) => (el.textContent ?? '').replace(/[  ]/g, ' ');
const CONTRE = fr.bookings.fiche.contreOffre;

function rendre(booking: Record<string, unknown>, user: { id: number; roles: string[] } = { id: 3, roles: ['agent'] }) {
  vi.mocked(useAuth).mockReturnValue({ user, token: 'tok' } as unknown as ReturnType<typeof useAuth>);
  vi.mocked(useBooking).mockReturnValue({ data: { data: booking }, isLoading: false, isError: false } as unknown as ReturnType<typeof useBooking>);
  return render(
    withIntl(
      <ToastProvider>
        <BookingDetail bookingId={Number(booking.id)} />
      </ToastProvider>,
    ),
  );
}

/** La valeur d'une ligne clé → valeur (`LigneCle`). */
function valeurDe(cle: string): string {
  const dt = screen.getAllByText(cle, { selector: 'dt' })[0]!;
  return texte(dt.nextElementSibling as HTMLElement);
}

const libelles = (el: HTMLElement) => within(el).getAllByRole('button').map((b) => texte(b).trim());

describe('BookingDetail — l’offre, sa contre-offre et ses conditions (TCK-2876)', () => {
  beforeEach(() => {
    ecran.telephone = false;
    ecran.personnel = true;
    geste.contreProposer.mockReset();
    geste.contreProposer.mockResolvedValue({ data: {} });
  });

  it('AC1 — à 390, une offre en attente montre « Contre-proposer » ENTRE Refuser et Accepter', () => {
    ecran.telephone = true;
    rendre(OFFRE);
    const barre = document.querySelector<HTMLElement>('[data-slot="barre-d-action"]')!;
    expect(libelles(barre)).toEqual(['Refuser', 'Contre-proposer', 'Accepter']);
  });

  it('AC1 — une candidature ne le montre pas, ni au téléphone ni au bureau', () => {
    ecran.telephone = true;
    const { unmount } = rendre(CANDIDATURE);
    expect(screen.queryByRole('button', { name: 'Contre-proposer' })).toBeNull();
    unmount();
    ecran.telephone = false;
    rendre(CANDIDATURE);
    expect(screen.queryByRole('button', { name: 'Contre-proposer' })).toBeNull();
  });

  it('jamais au bailleur (la politique ne l’admet pas), ni au client, ni sur une offre acceptée', () => {
    ecran.personnel = false;
    const { unmount } = rendre(OFFRE, { id: 3, roles: ['owner'] });
    expect(screen.queryByRole('button', { name: 'Contre-proposer' })).toBeNull();
    unmount();
    ecran.personnel = true;
    const client = rendre(OFFRE, { id: 40, roles: ['customer'] });
    expect(screen.queryByRole('button', { name: 'Contre-proposer' })).toBeNull();
    client.unmount();
    rendre({ ...OFFRE, status: 'confirmed', confirmed_at: '2026-11-12T08:00:00Z' });
    expect(screen.queryByRole('button', { name: 'Contre-proposer' })).toBeNull();
  });

  it('AC4 — à 1440, la carte « Décision » a trois boutons : Accepter {montant}, Contre-proposer, Refuser ; l’en-tête aussi le porte', () => {
    rendre(OFFRE);
    const gestes = document.querySelector<HTMLElement>('[data-slot="gestes-de-la-decision"]')!;
    expect(libelles(gestes)).toEqual(['Accepter 85 000 000 F', 'Contre-proposer', 'Refuser']);
    // L'en-tête (Refuser, Contre-proposer, Accepter) et la carte : deux gestes, la même feuille.
    expect(screen.getAllByRole('button', { name: 'Contre-proposer' })).toHaveLength(2);
  });

  it('AC3 — Financement Comptant, Délai de signature 30 jours, Conditions Aucune, avant « Valable jusqu’au »', () => {
    rendre(OFFRE);
    expect(valeurDe('Financement')).toBe('Comptant');
    expect(valeurDe('Délai de signature')).toBe('30 jours');
    expect(valeurDe('Conditions')).toBe('Aucune');
    const cles = screen.getAllByText(/./, { selector: 'dt' }).map((dt) => dt.textContent);
    expect(cles.indexOf('Conditions')).toBeLessThan(cles.indexOf('Valable jusqu’au'));
  });

  it('le financement se dit par son code : crédit immobilier, apport et crédit', () => {
    const { unmount } = rendre({ ...OFFRE, financing: 'mortgage' });
    expect(valeurDe('Financement')).toBe('Crédit immobilier');
    unmount();
    rendre({ ...OFFRE, financing: 'mixed', conditions: null, signature_within_days: null });
    expect(valeurDe('Financement')).toBe('Apport et crédit');
    expect(screen.queryByText('Délai de signature', { selector: 'dt' })).toBeNull();
    expect(screen.queryByText('Conditions', { selector: 'dt' })).toBeNull();
  });

  it('« En vente depuis 47 jours · 6 visites · première offre reçue. », puis le rang d’une offre suivante', () => {
    const { unmount } = rendre(OFFRE);
    expect(screen.getByText((_, el) => el?.tagName === 'P' && texte(el) === 'En vente depuis 47 jours · 6 visites · première offre reçue.')).toBeInTheDocument();
    unmount();
    rendre({ ...OFFRE, offer_rank: 3, property_visits_count: undefined });
    expect(screen.getByText((_, el) => el?.tagName === 'P' && texte(el) === 'En vente depuis 47 jours · 3ᵉ offre reçue.')).toBeInTheDocument();
  });

  it('AC2 — « Contre-proposer 90 000 000 F » envoie ce montant et une validité de 3 jours (un jour de Dakar)', async () => {
    ecran.telephone = true;
    rendre(OFFRE);
    const barre = document.querySelector<HTMLElement>('[data-slot="barre-d-action"]')!;
    fireEvent.click(within(barre).getByRole('button', { name: 'Contre-proposer' }));
    const feuille = screen.getByRole('dialog');
    const champ = within(feuille).getByLabelText(/Montant proposé/) as HTMLInputElement;
    // Prérempli du prix affiché.
    expect(texte({ textContent: champ.value } as Element)).toBe('95 000 000');
    fireEvent.change(champ, { target: { value: '90000000' } });
    const envoyer = screen.getAllByRole("button").find((b) => texte(b).trim() === "Contre-proposer 90 000 000 F")!;
    expect(envoyer).toBeTruthy();
    await act(async () => {
      fireEvent.click(envoyer);
    });
    expect(geste.contreProposer).toHaveBeenCalledTimes(1);
    expect(geste.contreProposer).toHaveBeenCalledWith({ amount: 90_000_000, valid_until: '2026-11-15' });
  });

  it('AC2 — la fiche montre ensuite « Contre-offre de 90 000 000 F envoyée · en attente d’Ibrahima », et « Modifier la contre-offre »', () => {
    rendre({ ...OFFRE, counter_offer: CONTRE_OFFRE, awaiting: 'customer' });
    const enCours = document.querySelector<HTMLElement>('[data-slot="contre-offre-en-cours"]')!;
    expect(texte(enCours)).toBe('Contre-offre de 90 000 000 F envoyée · en attente d’Ibrahima jusqu’au dim. 15 nov.');
    expect(screen.queryByRole('button', { name: 'Contre-proposer' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Modifier la contre-offre' })).toHaveLength(2);
    // L'historique dit l'envoi.
    expect(screen.getAllByText((_, el) => el?.tagName === 'P' && texte(el) === 'Contre-offre de 90 000 000 F envoyée').length).toBeGreaterThan(0);
  });

  it('« Modifier la contre-offre » reprend le montant en cours, et le dit', () => {
    ecran.telephone = true;
    rendre({ ...OFFRE, counter_offer: CONTRE_OFFRE, awaiting: 'customer' });
    fireEvent.click(screen.getByRole('button', { name: 'Modifier la contre-offre' }));
    const feuille = screen.getByRole('dialog');
    expect(texte({ textContent: (within(feuille).getByLabelText(/Montant proposé/) as HTMLInputElement).value } as Element)).toBe('90 000 000');
    expect(within(feuille).getByText(fr.bookings.feuilles.contreOffre.montantAideEnCours)).toBeInTheDocument();
  });

  it('au téléphone, la barre dit « Modifier » (le nom accessible garde « Modifier la contre-offre ») : trois gestes tiennent à 390', () => {
    ecran.telephone = true;
    rendre({ ...OFFRE, counter_offer: CONTRE_OFFRE, awaiting: 'customer' });
    const barre = document.querySelector<HTMLElement>('[data-slot="barre-d-action"]')!;
    expect(libelles(barre)).toEqual(['Refuser', 'Modifier', 'Accepter']);
    expect(within(barre).getByRole('button', { name: 'Modifier la contre-offre' })).toBeInTheDocument();
  });

  it('le bloc Qui dit comment l’acheteur paie : « Achat comptant » (maquette e4)', () => {
    rendre(OFFRE);
    const qui = document.querySelector<HTMLElement>('[data-slot="bloc-qui"]')!;
    expect(within(qui).getByText('Achat comptant')).toBeInTheDocument();
  });

  it('une contre-offre déclinée n’est plus « en cours » : l’historique seul la dit, « Contre-proposer » revient', () => {
    rendre({ ...OFFRE, counter_offer: { ...CONTRE_OFFRE, status: 'declined', responded_at: '2026-11-12T09:50:00Z' }, awaiting: 'agency' });
    expect(document.querySelector('[data-slot="contre-offre-en-cours"]')).toBeNull();
    expect(screen.getByText(CONTRE.statut.declined)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Contre-proposer' }).length).toBeGreaterThan(0);
  });

  it('le client ne lit ni la contre-offre en cours ni son historique ici (sa réponse est TCK-2879)', () => {
    rendre({ ...OFFRE, counter_offer: CONTRE_OFFRE, awaiting: 'customer' }, { id: 40, roles: ['customer'] });
    expect(document.querySelector('[data-slot="contre-offre-en-cours"]')).toBeNull();
    expect(screen.queryByText((_, el) => el?.tagName === 'P' && texte(el) === 'Contre-offre de 90 000 000 F envoyée')).toBeNull();
  });
});
