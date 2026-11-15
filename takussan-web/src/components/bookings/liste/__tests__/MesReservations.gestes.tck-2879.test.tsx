/**
 * TCK-2879 — « Mes réservations », côté client (maquette `app-reservations` a, e9) : l'encart d'appel et
 * le geste qu'il faut sur chaque carte — un seul, par priorité —, « Annuler » là où l'API le permet,
 * la contre-offre à accepter ou décliner, et le sous-titre compté du bureau.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FournisseurDEnTete, useDeclarationDEnTete } from '@/components/layout/en-tete-de-la-coque';
import { ToastProvider } from '@/components/ui/toast';
import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import type { Booking } from '@/types/booking';
import { MesReservations } from '../MesReservations';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/app/bookings',
}));
// Dimanche 15 novembre 2026, 10 h à Dakar : jeudi est le 19.
vi.mock('@/hooks/useMinuteCourante', () => ({ useMinuteCourante: () => new Date('2026-11-15T10:00:00Z') }));

const zero = { pending: 0, confirmed: 0, completed: 0, rejected: 0, cancelled: 0, expired: 0 };
const etat = vi.hoisted(() => ({
  comptes: null as null | Record<string, Record<string, number>>,
  reservations: [] as Partial<Booking>[],
  annuler: vi.fn(),
  repondre: vi.fn(),
}));
vi.mock('@/lib/queries/bookings', () => ({
  useBookings: () => ({ data: { data: etat.reservations, meta: { current_page: 1, last_page: 1, total: etat.reservations.length } }, isPending: false, isError: false, refetch: vi.fn() }),
  useBookingCounts: () => ({ data: etat.comptes ? { data: etat.comptes } : undefined, isError: false }),
  useCancelBooking: () => ({ mutateAsync: etat.annuler, isPending: false }),
}));
vi.mock('@/lib/queries/booking-gestes-du-client', () => ({
  useRepondreALaContreOffre: () => ({ mutateAsync: etat.repondre, isPending: false }),
}));

const texte = (el: HTMLElement) => (el.textContent ?? '').replace(/[\u00a0\u202f]/g, ' ');
const bien = (id: number, title: string, quarter: string) => ({ id, title, slug: `b-${id}`, main_photo_url: null, price: 0, currency: 'XOF' as const, contract_type: 'rent' as const, location: { quarter } });

/** Séjour confirmé, acompte de 33 000 F dû, arrivée jeudi 19. */
const duplex: Partial<Booking> = {
  id: 1, kind: 'stay', status: 'confirmed', total_amount: 110_000, deposit_amount: 33_000, amount_paid: 0, currency: 'XOF',
  start_date: '2026-11-19', end_date: '2026-11-21', created_at: '2026-11-01T10:00:00Z', property: bien(1, 'Duplex vue mer', 'Ngor'),
};
/** Séjour confirmé, acompte payé, solde de 147 000 F. */
const villa: Partial<Booking> = {
  id: 2, kind: 'stay', status: 'confirmed', total_amount: 210_000, deposit_amount: 63_000, amount_paid: 63_000, currency: 'XOF',
  start_date: '2026-12-05', end_date: '2026-12-08', created_at: '2026-11-02T10:00:00Z', property: bien(2, 'Villa blanche', 'Yoff'),
};
/** Candidature 3/4, il manque l'attestation de travail. */
const deuxPieces: Partial<Booking> = {
  id: 3, kind: 'application', status: 'pending', total_amount: 380_000, deposit_amount: null, amount_paid: 0, currency: 'XOF',
  created_at: '2026-11-13T10:00:00Z', dossier: { received: 3, required: 4, missing: ['employment_certificate'] }, property: bien(3, 'Deux-pièces rénové', 'Point E'),
};
/** Offre avec une contre-offre qui attend le client. */
const appartement: Partial<Booking> = {
  id: 4, kind: 'offer', status: 'pending', total_amount: 85_000_000, deposit_amount: null, amount_paid: 0, currency: 'XOF',
  created_at: '2026-11-10T10:00:00Z', awaiting: 'customer', property: bien(4, 'Appartement F4', 'Almadies'),
  counter_offer: { id: 9, amount: 90_000_000, message: null, valid_until: '2026-11-18', status: 'pending', created_at: '2026-11-14T10:00:00Z', responded_at: null },
};

function rendre() {
  return render(
    withIntl(
      <ToastProvider>
        <MesReservations />
      </ToastProvider>,
    ),
  );
}
const carte = (titre: string) => screen.getAllByRole('listitem').find((li) => texte(li).includes(titre))!;

describe('MesReservations — gestes du client (TCK-2879)', () => {
  beforeEach(() => {
    etat.annuler.mockReset();
    etat.repondre.mockReset();
    etat.comptes = { stay: { ...zero, confirmed: 2 }, application: { ...zero, pending: 1 }, offer: { ...zero } };
    etat.reservations = [duplex, villa, deuxPieces];
  });

  it('AC1 — acompte dû jeudi : l’encart, « Payer l’acompte » vers le paiement de la fiche, et « Annuler »', () => {
    rendre();
    const c = carte('Duplex vue mer');
    expect(texte(c)).toContain('Acompte de 33 000 F à payer avant jeudi.');
    const payer = within(c).getByRole('link', { name: fr.bookings.client.actions.payerAcompte });
    expect(payer).toHaveAttribute('href', '/app/bookings/1#paiement');
    // Le seul geste primaire de la maquette : plein, sur un encart d'alerte.
    expect(payer.className).toContain('bg-primary');
    expect(c.querySelector('[data-slot="encart-d-appel"]')).toHaveClass('bg-warning/15');
    expect(within(c).getByRole('button', { name: /^Annuler la réservation/ })).toBeInTheDocument();
    // Un seul geste primaire : plus de « Voir la réservation » sur cette carte.
    expect(within(c).queryByRole('link', { name: fr.bookings.client.actions.voir })).toBeNull();
  });

  it('arrivée au-delà de six jours : « avant le 28 nov. »', () => {
    etat.reservations = [{ ...duplex, start_date: '2026-11-28', end_date: '2026-11-30' }];
    rendre();
    expect(texte(carte('Duplex vue mer'))).toContain('Acompte de 33 000 F à payer avant le 28 nov.');
  });

  it('acompte payé : « solde de 147 000 F à l’arrivée » et « Payer le solde »', () => {
    rendre();
    const c = carte('Villa blanche');
    expect(texte(c)).toContain('Acompte payé · solde de 147 000 F à l’arrivée');
    const solde = within(c).getByRole('link', { name: fr.bookings.client.actions.payerSolde });
    expect(solde).toHaveAttribute('href', '/app/bookings/2#paiement');
    // Le solde se dit en sourdine (maquette : ni plein ni alerte).
    expect(solde.className).not.toContain('bg-primary');
    expect(c.querySelector('[data-slot="encart-d-appel"]')).not.toHaveClass('bg-warning/15');
  });

  it('AC2 — dossier 3/4 : « il manque votre attestation de travail » et « Compléter mon dossier » vers la section Dossier ; à 4/4, aucun geste', () => {
    const { unmount } = rendre();
    const c = carte('Deux-pièces rénové');
    expect(texte(c)).toContain('Dossier 3/4 : il manque votre attestation de travail.');
    expect(within(c).getByRole('link', { name: fr.bookings.client.actions.completerDossier })).toHaveAttribute('href', '/app/bookings/3#dossier');
    unmount();

    etat.reservations = [{ ...deuxPieces, dossier: { received: 4, required: 4, missing: [] } }];
    rendre();
    const complet = carte('Deux-pièces rénové');
    expect(texte(complet)).toContain('Dossier complet · 4/4 pièces.');
    expect(within(complet).queryByRole('link', { name: fr.bookings.client.actions.completerDossier })).toBeNull();
    expect(within(complet).getByRole('link', { name: fr.bookings.client.actions.voir })).toHaveAttribute('href', '/app/bookings/3');
  });

  it('AC3 — contre-offre : l’encart, « Accepter » appelle la route, puis la carte relue dit « Confirmée »', async () => {
    etat.reservations = [appartement];
    const { unmount } = rendre();
    const c = carte('Appartement F4');
    expect(texte(c)).toContain('L’agence vous propose 90 000 000 F jusqu’au mer. 18 nov.');
    fireEvent.click(within(c).getByRole('button', { name: fr.bookings.client.actions.accepter }));
    await waitFor(() => expect(etat.repondre).toHaveBeenCalledWith({ contreOffreId: 9, reponse: 'accept' }));
    fireEvent.click(within(c).getByRole('button', { name: fr.bookings.client.actions.decliner }));
    await waitFor(() => expect(etat.repondre).toHaveBeenLastCalledWith({ contreOffreId: 9, reponse: 'decline' }));
    unmount();

    // L'API confirme l'offre au montant de la contre-offre : la liste relue la dit « Confirmée », sans réponse à donner.
    etat.reservations = [{ ...appartement, status: 'confirmed', awaiting: null, total_amount: 90_000_000, counter_offer: { ...appartement.counter_offer!, status: 'accepted' } }];
    rendre();
    const confirmee = carte('Appartement F4');
    expect(texte(confirmee)).toContain(fr.bookings.status.confirmed);
    expect(within(confirmee).queryByRole('button', { name: fr.bookings.client.actions.accepter })).toBeNull();
  });

  it('« Annuler » absent d’un séjour commencé et d’une réservation terminée', () => {
    etat.reservations = [{ ...duplex, start_date: '2026-11-15' }, { ...villa, status: 'completed' }];
    rendre();
    expect(screen.queryAllByRole('button', { name: /^Annuler la réservation/ })).toHaveLength(0);
  });

  it('« Annuler » passe par la confirmation (motif en toutes lettres), puis `POST …/cancel`', async () => {
    etat.annuler.mockResolvedValue({});
    rendre();
    fireEvent.click(within(carte('Duplex vue mer')).getByRole('button', { name: /^Annuler la réservation/ }));
    const motif = await screen.findByRole('textbox');
    fireEvent.change(motif, { target: { value: 'Changement de dates' } });
    fireEvent.click(screen.getByRole('button', { name: fr.bookings.detail.decision.cancel.submit }));
    await waitFor(() => expect(etat.annuler).toHaveBeenCalledWith({ reason: 'Changement de dates' }));
  });

  it('AC4 — le sous-titre du bureau : « 3 en cours, dont un acompte à payer avant jeudi »', () => {
    rendre();
    expect(screen.getByText((_, el) => el?.tagName === 'P' && texte(el as HTMLElement) === '3 en cours, dont un acompte à payer avant jeudi')).toBeInTheDocument();
  });

  it('sans acompte dû, le sous-titre reste « N en cours »', () => {
    etat.reservations = [villa, deuxPieces];
    rendre();
    expect(screen.getByText('3 en cours')).toBeInTheDocument();
  });

  it('AC5 — la coque du téléphone titre la page « Mes réservations » (l’en-tête de page, caché sous md, le déclare)', () => {
    function EnTete() {
      const { titre } = useDeclarationDEnTete();
      return <header data-testid="en-tete">{titre}</header>;
    }
    render(
      withIntl(
        <ToastProvider>
          <FournisseurDEnTete>
            <EnTete />
            <MesReservations />
          </FournisseurDEnTete>
        </ToastProvider>,
      ),
    );
    expect(screen.getByTestId('en-tete')).toHaveTextContent(fr.bookings.client.titre);
  });
});
