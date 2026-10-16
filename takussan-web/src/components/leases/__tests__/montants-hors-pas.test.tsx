import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

/**
 * Références STABLES, comme les vrais hooks (cf. TCK-564 E-repair-1) ; hissées parce que les
 * fabriques de `vi.mock` s'exécutent avant le corps du module.
 */
const { MUTATION, ROUTEUR, AUTH, BIENS, CLIENTS, API_REQUEST, CLIENT_REQUETES } = vi.hoisted(() => ({
  MUTATION: { mutateAsync: async () => ({ data: { id: 1 } }), isPending: false },
  ROUTEUR: { push: () => {}, back: () => {} },
  AUTH: { user: { id: 4, full_name: 'Moussa Fall' }, token: 'jeton' },
  BIENS: { data: [] },
  CLIENTS: { data: [] },
  API_REQUEST: vi.fn(async (_chemin: string, _options?: unknown) => ({ data: {} })),
  CLIENT_REQUETES: { invalidateQueries: async () => {} },
}));

vi.mock('next/navigation', () => ({ useRouter: () => ROUTEUR }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => AUTH }));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => CLIENT_REQUETES,
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: API_REQUEST,
}));
vi.mock('@/lib/queries/leases', () => ({
  useCreateLease: () => MUTATION,
  useCreateLeasePayment: () => MUTATION,
  useLeasePropertyOptions: () => ({ data: BIENS, isLoading: false }),
  useLeaseCustomerOptions: () => ({ data: CLIENTS, isLoading: false }),
}));
vi.mock('@/lib/queries/bookings', () => ({ useCreateBookingPayment: () => MUTATION }));
vi.mock('@/lib/queries/payments', () => ({ useCreateInvoice: () => MUTATION }));

import { CreateLeaseForm } from '../CreateLeaseForm';
import { DepositRefundModal } from '../DepositRefundModal';
import { LeasePaymentDialog } from '../LeasePaymentDialog';
import { BookingPaymentDialog } from '../../bookings/BookingPaymentDialog';
import { CreateInvoiceDialog } from '../../payments/CreateInvoiceDialog';

/**
 * TCK-670 (P04.04, P08.03) — un montant n'est jamais refusé par le PAS natif du champ.
 *
 * Les champs montant portaient `step={1000}` ou `step={100}` dans un `<form>` sans `noValidate` :
 * le navigateur refusait l'envoi (`stepMismatch`) d'un loyer de 152 500 ou d'un paiement de
 * 12 350, avant même `onSubmit`, et la modale de restitution (`min={0.01} step={1000}`) refusait
 * tout montant rond, donc la restitution intégrale pré-remplie. Décision du porteur :
 * `step="any"` et `min={1}`, zod reste la seule borne.
 */
function champ(nom: string): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>(`input[name="${nom}"]`);
  if (!el) throw new Error(`champ introuvable : ${nom}`);
  return el;
}

function saisir(nom: string, valeur: string): HTMLInputElement {
  const el = champ(nom);
  fireEvent.change(el, { target: { value: valeur } });
  return el;
}

describe('montants hors de l’ancien pas : jamais refusés par le navigateur (TCK-670)', () => {
  it('restitution de caution : le montant rond pré-rempli part au serveur', async () => {
    const user = userEvent.setup();
    render(
      withIntl(
        <DepositRefundModal open onOpenChange={() => {}} leaseId={7} depositRemaining={150_000} currency="XOF" />,
      ),
    );
    const montant = document.getElementById('deposit-refund-amount') as HTMLInputElement;
    expect(montant.value).toBe('150000');
    expect(montant.validity.stepMismatch).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Confirmer le remboursement' }));

    await waitFor(() => expect(API_REQUEST).toHaveBeenCalledTimes(1));
    expect(API_REQUEST.mock.calls[0]?.[0]).toBe('/api/leases/7/deposit-refund');
  });

  it('création de bail : un loyer de 152 500 et une caution de 75 500 sont valides', () => {
    render(withIntl(<CreateLeaseForm />));
    expect(saisir('monthly_rent', '152500').validity.valid).toBe(true);
    expect(saisir('deposit_amount', '75500').validity.valid).toBe(true);
    expect(saisir('deposit_amount', '0').validity.valid).toBe(true);
  });

  it('paiement de bail : 12 350 est valide', () => {
    render(withIntl(<LeasePaymentDialog leaseId={7} open onOpenChange={() => {}} />));
    expect(saisir('amount', '12350').validity.valid).toBe(true);
  });

  it('paiement de réservation : 12 350 est valide', () => {
    render(withIntl(<BookingPaymentDialog bookingId={7} open onOpenChange={() => {}} />));
    expect(saisir('amount', '12350').validity.valid).toBe(true);
  });

  it('facture : un prix unitaire de 12 350 est valide', () => {
    render(withIntl(<CreateInvoiceDialog open onOpenChange={() => {}} />));
    expect(saisir('items.0.unit_price', '12350').validity.valid).toBe(true);
  });
});
