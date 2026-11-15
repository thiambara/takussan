/**
 * TCK-2594 — les feuilles de la fiche d'une réservation (maquette `app-reservations` a : « Refuser
 * (motif) », « Enregistrer un paiement », « Rembourser ») : la feuille du bas au téléphone, le
 * panneau droit dès `xl` ; le refus motivé en pastilles, le paiement prérempli du reste à encaisser
 * avec les huit moyens de l'API en clair, le remboursement qui dit son plafond et son montant.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import type { Booking } from '@/types/booking';
import { BookingPaymentDialog } from '../../BookingPaymentDialog';
import { BookingRefundPanel } from '../../BookingRefundPanel';
import { FeuilleDeDecision } from '../FeuilleDeDecision';

const ecran = vi.hoisted(() => ({ large: false }));
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: (q: string) => (q.includes('80rem') ? ecran.large : false) }));
const appels = vi.hoisted(() => ({ paiement: vi.fn(), remboursement: vi.fn() }));
vi.mock('@/lib/queries/bookings', () => ({
  useCreateBookingPayment: () => ({ mutateAsync: appels.paiement, isPending: false }),
  useRefundBookingPayment: () => ({ mutateAsync: appels.remboursement, isPending: false }),
}));

const F = fr.bookings.feuilles;
/** « 115 500 F » quel que soit l'espace insécable que la locale écrit. */
const montant = (texte: string) => new RegExp(texte.replace(/ /g, '[\\s\\u00a0\\u202f]'));

beforeEach(() => {
  ecran.large = false;
  appels.paiement.mockReset().mockResolvedValue({});
  appels.remboursement.mockReset().mockResolvedValue({});
});

describe('FeuilleDeDecision — refuser, annuler, accepter', () => {
  function ouvrir(action: 'reject' | 'cancel' | 'confirm', nature: 'application' | 'offer' | 'stay' | 'autre' = 'application', onSubmit = vi.fn().mockResolvedValue(undefined)) {
    render(withIntl(<FeuilleDeDecision action={action} nature={nature} prenom="Ousmane" pending={false} onOpenChange={() => {}} onSubmit={onSubmit} />));
    return { onSubmit, feuille: screen.getByRole('dialog') };
  }

  it('une candidature se refuse par un motif en pastilles, plus une précision, et le geste prévient le client', async () => {
    const { onSubmit, feuille } = ouvrir('reject');
    expect(within(feuille).getByText('Refuser la candidature')).toBeInTheDocument();
    const geste = screen.getByRole('button', { name: 'Refuser et prévenir Ousmane' });
    expect(geste).toBeDisabled();
    expect(within(feuille).getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual([
      'Dossier incomplet',
      'Revenus insuffisants',
      'Bien déjà attribué',
      'Autre…',
    ]);

    fireEvent.click(within(feuille).getByRole('radio', { name: 'Bien déjà attribué' }));
    fireEvent.change(within(feuille).getByRole('textbox', { name: F.decision.refuser.precision }), { target: { value: 'Le F3 vient d’être attribué.' } });
    expect(geste).toBeEnabled();
    fireEvent.click(geste);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Bien déjà attribué — Le F3 vient d’être attribué.'));
  });

  it('« Autre… » demande la précision avant de laisser refuser', () => {
    const { onSubmit, feuille } = ouvrir('reject');
    fireEvent.click(within(feuille).getByRole('radio', { name: 'Autre…' }));
    const geste = screen.getByRole('button', { name: 'Refuser et prévenir Ousmane' });
    expect(geste).toBeDisabled();
    fireEvent.change(within(feuille).getByRole('textbox'), { target: { value: 'Le bailleur reprend le bien.' } });
    expect(geste).toBeEnabled();
    fireEvent.click(geste);
    expect(onSubmit).toHaveBeenCalledWith('Le bailleur reprend le bien.');
  });

  it('les motifs suivent la nature : une offre se refuse « trop basse » ou « bien déjà vendu »', () => {
    const { feuille } = ouvrir('reject', 'offer');
    expect(within(feuille).getByText('Refuser l’offre')).toBeInTheDocument();
    expect(within(feuille).getByRole('radio', { name: 'Offre trop basse' })).toBeInTheDocument();
    expect(within(feuille).getByRole('radio', { name: 'Bien déjà vendu' })).toBeInTheDocument();
    expect(within(feuille).queryByRole('radio', { name: 'Revenus insuffisants' })).toBeNull();
  });

  it('l’annulation demande son motif en toutes lettres', () => {
    const { onSubmit, feuille } = ouvrir('cancel', 'stay');
    expect(within(feuille).queryByRole('radio')).toBeNull();
    const geste = screen.getByRole('button', { name: fr.bookings.detail.decision.cancel.submit });
    expect(geste).toBeDisabled();
    fireEvent.change(within(feuille).getByRole('textbox'), { target: { value: 'Indisponible' } });
    fireEvent.click(geste);
    expect(onSubmit).toHaveBeenCalledWith('Indisponible');
  });

  it('accepter n’a rien à saisir : un geste, sans motif envoyé', () => {
    const { onSubmit, feuille } = ouvrir('confirm');
    expect(within(feuille).queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: fr.bookings.detail.decision.confirm.submit }));
    expect(onSubmit).toHaveBeenCalledWith(undefined);
  });

  it('au téléphone, une feuille du bas ; dès xl, le panneau droit', () => {
    const { unmount } = render(withIntl(<FeuilleDeDecision action="reject" nature="stay" prenom="Awa" pending={false} onOpenChange={() => {}} onSubmit={vi.fn()} />));
    expect(document.querySelector('[data-slot="feuille-du-bas"]')).not.toBeNull();
    unmount();
    ecran.large = true;
    render(withIntl(<FeuilleDeDecision action="reject" nature="stay" prenom="Awa" pending={false} onOpenChange={() => {}} onSubmit={vi.fn()} />));
    expect(document.querySelector('[data-slot="panneau-droit"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="feuille-du-bas"]')).toBeNull();
  });
});

describe('BookingPaymentDialog — « Enregistrer un paiement »', () => {
  it('prérempli du reste, le geste dit le montant ; les huit moyens en clair ; envoie ce qui est choisi', async () => {
    render(withIntl(<BookingPaymentDialog bookingId={7} open onOpenChange={() => {}} restant={115_500} typeParDefaut="advance" devise="XOF" />));
    const feuille = screen.getByRole('dialog');
    expect(within(feuille).getByText(F.paiement.montantAide)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: montant('Enregistrer 115 500 F') })).toBeInTheDocument();

    const moyens = within(screen.getByRole('group', { name: F.paiement.moyen })).getAllByRole('radio');
    expect(moyens.map((r) => r.closest('label')?.textContent)).toEqual([
      'Orange Money',
      'Wave',
      'Espèces',
      'Virement bancaire',
      'Chèque',
      'Free Money',
      'Mobile Money',
      'Carte bancaire',
    ]);
    expect(within(screen.getByRole('group', { name: F.paiement.type })).getByRole('radio', { name: 'Solde' })).toBeChecked();

    fireEvent.click(within(feuille).getByRole('radio', { name: 'Wave' }));
    expect(within(feuille).getByText('Le numéro de la transaction Wave.')).toBeInTheDocument();
    fireEvent.change(within(feuille).getByRole('textbox', { name: F.paiement.reference }), { target: { value: 'WV-2291-5530' } });
    fireEvent.click(screen.getByRole('button', { name: montant('Enregistrer 115 500 F') }));

    await waitFor(() => expect(appels.paiement).toHaveBeenCalledTimes(1));
    expect(appels.paiement.mock.calls[0]![0]).toMatchObject({ amount: 115_500, payment_method: 'wave', payment_type: 'advance', transaction_id: 'WV-2291-5530' });
  });

  it('sans reste connu, rien n’est prérempli et le geste ne promet pas de montant', () => {
    render(withIntl(<BookingPaymentDialog bookingId={7} open onOpenChange={() => {}} />));
    expect(screen.queryByText(F.paiement.montantAide)).toBeNull();
    expect(screen.getByRole('button', { name: F.paiement.enregistrer })).toBeInTheDocument();
  });
});

describe('BookingRefundPanel — « Rembourser Awa Diop »', () => {
  const booking = {
    id: 3,
    status: 'cancelled',
    currency: 'XOF',
    refund_status: 'pending',
    can_refund: true,
    customer_id: 12,
    customer: { id: 12, user_id: 40, first_name: 'Awa', last_name: 'Diop' },
    booking_payments: [
      { id: 41, booking_id: 3, amount: 49_500, currency: 'XOF', payment_type: 'deposit', payment_method: 'wave', status: 'paid', paid_out: { processed_at: '2026-11-02T10:00:00Z', reference_number: 'PO-2026-11' } },
    ],
  } as unknown as Booking;

  it('nomme le client, dit le plafond, avertit des fonds reversés et rembourse le montant dit', async () => {
    render(withIntl(<BookingRefundPanel booking={booking} locale="fr" isCustomer={false} />));
    fireEvent.click(screen.getByRole('button', { name: fr.bookings.detail.refund.action }));
    const feuille = screen.getByRole('dialog');

    expect(within(feuille).getByText('Rembourser Awa Diop')).toBeInTheDocument();
    expect(within(feuille).getByText(montant('Au plus 49 500 F : ce que Awa a payé.'))).toBeInTheDocument();
    expect(within(feuille).getByRole('alert')).toHaveTextContent(/PO-2026-11/);

    fireEvent.change(within(feuille).getByRole('textbox', { name: fr.bookings.detail.refund.fields.reason }), { target: { value: 'Séjour annulé deux jours avant.' } });
    fireEvent.click(screen.getByRole('button', { name: montant('Rembourser 49 500 F') }));

    await waitFor(() => expect(appels.remboursement).toHaveBeenCalledTimes(1));
    expect(appels.remboursement.mock.calls[0]![0]).toMatchObject({ paymentId: 41, refund_amount: 49_500, refund_reason: 'Séjour annulé deux jours avant.' });
  });
});
