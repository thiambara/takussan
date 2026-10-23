/**
 * TCK-681 (P13.01) — « Enregistrer un paiement reçu » règle l'échéance choisie par `mark-paid`.
 *
 * Le dialogue postait sur `POST /api/leases/{id}/payments` un montant, une période, `paid_at` et
 * une référence. La création ne lit ni `paid_at` ni la référence : saisir un loyer reçu ajoutait
 * une échéance EN ATTENTE, sans date, à côté de celle qui restait due. La voie gardée
 * (`mark-paid` : verrou, checkout ouvert, caution) n'avait aucun appelant dans le front.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import type { LeasePayment } from '@/types/lease';

const { PAIEMENTS, REGLER } = vi.hoisted(() => ({
  PAIEMENTS: { data: { data: [] as LeasePayment[] } },
  REGLER: { mutateAsync: vi.fn(async (_v: unknown) => ({ data: {} })), isPending: false },
}));

vi.mock('@/lib/queries/leases', () => ({
  useLeasePayments: () => PAIEMENTS,
  useMarkLeasePaymentPaid: () => REGLER,
  // L'ancienne voie (création d'échéance), exposée pour que l'ablation — l'ancien dialogue remis —
  // rougisse sur ses assertions et non sur un export absent du mock.
  useCreateLeasePayment: () => REGLER,
}));

import { LeasePaymentDialog } from '../LeasePaymentDialog';

function echeance(p: Partial<LeasePayment> & Pick<LeasePayment, 'id' | 'status'>): LeasePayment {
  return {
    reference_number: null,
    lease_id: 7,
    payer_id: 1,
    collector_id: null,
    amount: 250_000,
    currency: 'XOF',
    payment_method: null,
    payment_type: 'rent',
    period_start: '2026-05-01',
    period_end: '2026-05-31',
    due_date: '2026-05-05',
    paid_at: null,
    paid_amount: 0,
    remaining_amount: 250_000,
    late_fee_amount: null,
    late_fee_applied_at: null,
    late_fee_paid_at: null,
    late_fee_outstanding: 0,
    late_fee_payable_online: false,
    amount_due: 250_000,
    receipt_available: false,
    is_overdue: false,
    notes: null,
    created_at: '2026-04-01T00:00:00+00:00',
    ...p,
  };
}

function monter() {
  return render(withIntl(<LeasePaymentDialog leaseId={7} open onOpenChange={() => {}} />));
}

beforeEach(() => {
  REGLER.mutateAsync.mockClear();
  PAIEMENTS.data.data = [
    echeance({ id: 11, status: 'paid', period_start: '2026-03-01', period_end: '2026-03-31' }),
    echeance({ id: 12, status: 'late', period_start: '2026-04-01', period_end: '2026-04-30' }),
    echeance({ id: 13, status: 'pending', period_start: '2026-05-01', period_end: '2026-05-31' }),
    echeance({ id: 14, status: 'cancelled', period_start: '2026-06-01', period_end: '2026-06-30' }),
  ];
});

describe('LeasePaymentDialog — règle une échéance existante (TCK-681)', () => {
  it('ne propose que les échéances en attente ou en retard', async () => {
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByRole('combobox', { name: /Échéance/ }));
    const options = await screen.findAllByRole('option');

    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringContaining('1 avr. 2026'),
      expect.stringContaining('1 mai 2026'),
    ]);
  });

  it('règle l’échéance choisie par mark-paid, sans créer de ligne ni saisir de montant', async () => {
    const user = userEvent.setup();
    monter();

    expect(document.querySelector('input[name="amount"]')).toBeNull();

    await user.click(screen.getByRole('combobox', { name: /Échéance/ }));
    await user.click(await screen.findByRole('option', { name: /1 mai 2026/ }));
    await user.type(screen.getByLabelText('Référence / Reçu'), 'REC-42');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(REGLER.mutateAsync).toHaveBeenCalledTimes(1));
    expect(REGLER.mutateAsync).toHaveBeenCalledWith({
      paymentId: 13,
      payment_method: 'cash',
      transaction_id: 'REC-42',
    });
  });

  it('sans échéance à régler, le dit et n’offre pas l’envoi', () => {
    PAIEMENTS.data.data = [echeance({ id: 11, status: 'paid' })];
    monter();

    expect(screen.getByText('Aucune échéance en attente sur ce bail.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toHaveProperty('disabled', true);
  });
});

/**
 * TCK-1825 (P183.03) — une restitution de caution se règle par son reversement : `mark-paid` la
 * refuse en 422 (`lease_payment.deposit_refund_paid_by_payout`, TCK-594). Le dialogue la proposait
 * comme un loyer, et, seule en attente, empêchait de dire qu'il n'y avait rien à régler.
 */
describe('LeasePaymentDialog — la restitution de caution n’est pas à régler ici (TCK-1825)', () => {
  it('ne propose pas une restitution de caution en attente', async () => {
    PAIEMENTS.data.data = [
      echeance({ id: 13, status: 'pending', period_start: '2026-05-01', period_end: '2026-05-31' }),
      echeance({
        id: 15,
        status: 'pending',
        payment_type: 'deposit_refund',
        period_start: '2026-06-01',
        period_end: '2026-06-30',
      }),
    ];
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByRole('combobox', { name: /Échéance/ }));
    const options = await screen.findAllByRole('option');

    expect(options.map((o) => o.textContent)).toEqual([expect.stringContaining('1 mai 2026')]);
  });

  it('avec une restitution seule en attente, dit qu’il n’y a rien à régler', () => {
    PAIEMENTS.data.data = [
      echeance({ id: 15, status: 'pending', payment_type: 'deposit_refund' }),
    ];
    monter();

    expect(screen.getByText('Aucune échéance en attente sur ce bail.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toHaveProperty('disabled', true);
  });
});
