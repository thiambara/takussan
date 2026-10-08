/**
 * TCK-593 (Partie 2) — la vue « Paiements » du client.
 *
 * Ce qu'elle doit tenir : le prochain montant dû EN TÊTE, tel que l'API le rend (`amount_due`,
 * jamais une addition côté client), « Payer » avant l'historique, une pénalité non encaissée en
 * ligne rappelée À PART, un historique en cartes avec la quittance des loyers payés, et les dus
 * filtrés côté serveur.
 */
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import type { PaymentHistoryRow } from '@/types/invoice';
import { CustomerPayments } from '../CustomerPayments';

const usePaymentsHistory = vi.fn();
vi.mock('@/lib/queries/payments', () => ({
  usePaymentsHistory: (...args: unknown[]) => usePaymentsHistory(...args),
}));
vi.mock('@/hooks/useInitiatePayment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useInitiatePayment')>()),
  useInitiatePayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));

const texte = (s: string | null | undefined) => (s ?? '').replace(/[  ]/g, ' ');

function ligne(surcharge: Partial<PaymentHistoryRow>): PaymentHistoryRow {
  return {
    source: 'lease',
    id: 1,
    reference_number: null,
    amount: 150000,
    currency: 'XOF',
    payment_method: null,
    payment_type: 'rent',
    status: 'paid',
    paid_amount: 150000,
    remaining_amount: 0,
    late_fee_amount: null,
    late_fee_outstanding: 0,
    late_fee_payable_online: false,
    amount_due: 0,
    date: '2026-08-01T00:00:00Z',
    paid_at: '2026-08-03T00:00:00Z',
    period_start: '2026-08-01',
    period_end: '2026-08-31',
    due_date: '2026-08-05',
    booking_id: null,
    lease_id: 9,
    property_id: 3,
    customer_id: 4,
    created_at: '2026-08-01T00:00:00Z',
    ...surcharge,
  };
}

/** L'échéance des AC : 150 000 de loyer, 7 500 de pénalité que l'agence n'encaisse pas en ligne. */
const DUE = ligne({
  id: 12,
  status: 'late',
  paid_amount: 0,
  remaining_amount: 150000,
  late_fee_amount: 7500,
  late_fee_outstanding: 7500,
  late_fee_payable_online: false,
  amount_due: 150000,
  paid_at: null,
  period_start: '2026-09-01',
  period_end: '2026-09-30',
  due_date: '2026-09-05',
});

const HISTORIQUE = [
  ligne({ id: 11, reference_number: 'LP-11' }),
  ligne({ id: 50, source: 'booking', lease_id: null, booking_id: 2, amount: 50000 }),
  DUE,
];

function reponse(data: PaymentHistoryRow[]) {
  return {
    data: { data, meta: { current_page: 1, last_page: 1, per_page: 20, total: data.length } },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };
}

beforeEach(() => {
  usePaymentsHistory.mockReset();
  usePaymentsHistory.mockImplementation((params: { status?: string }) =>
    params.status ? reponse([DUE]) : reponse(HISTORIQUE),
  );
});

function rendre() {
  return render(withIntl(<CustomerPayments />));
}

describe('CustomerPayments (TCK-593 Partie 2)', () => {
  it('filtre les dus côté serveur : pending, partially_paid, late, failed', () => {
    rendre();
    expect(usePaymentsHistory).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending,partially_paid,late,failed' }),
    );
  });

  // Ajouté après vérification adverse : réglage désactivé (le cas par défaut), le locataire paie
  // le loyer en ligne et la pénalité reste due — elle disparaissait de /app/payments.
  it('rappelle la pénalité restant due sur un loyer PAYÉ de l’historique', () => {
    const payeAvecPenalite = ligne({ id: 13, late_fee_amount: 7500, late_fee_outstanding: 7500 });
    usePaymentsHistory.mockImplementation((params: { status?: string }) =>
      params.status ? reponse([]) : reponse([payeAvecPenalite, ligne({ id: 11 })]),
    );
    rendre();
    const cartes = within(screen.getByTestId('historique-client')).getAllByRole('listitem');
    const rappel = within(cartes[0]).getByTestId('penalite-hors-ligne');
    expect(texte(rappel.textContent)).toContain('7 500 F CFA');
    expect(within(cartes[1]).queryByTestId('penalite-hors-ligne')).toBeNull();
  });

  it('affiche en tête amount_due tel que l’API le rend, et « Payer » de ce montant', () => {
    rendre();
    expect(texte(screen.getByTestId('montant-du').textContent)).toBe('150 000 F CFA');
    expect(texte(screen.getByRole('button', { name: /^Payer / }).textContent)).toBe(
      'Payer 150 000 F CFA',
    );
  });

  it('« Payer » vient AVANT l’historique dans la page', () => {
    rendre();
    const payer = screen.getByRole('button', { name: /^Payer / });
    const historique = screen.getByRole('heading', { name: fr.payments.customer.historyTitle });
    expect(payer.compareDocumentPosition(historique) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('rappelle À PART la pénalité à régler auprès de l’agence', () => {
    rendre();
    const rappel = texte(screen.getByTestId('penalite-hors-ligne').textContent);
    expect(rappel).toContain('7 500 F CFA');
    expect(rappel).toContain('auprès de l’agence');
  });

  it('historique en cartes, quittance sur le loyer payé seulement', () => {
    rendre();
    expect(screen.queryByRole('table')).toBeNull();
    const cartes = within(screen.getByTestId('historique-client')).getAllByRole('listitem');
    expect(cartes).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: fr.payments.customer.receiptPdf })).toHaveLength(1);
  });

  it('à jour : aucun « Payer », un message clair', () => {
    usePaymentsHistory.mockImplementation((params: { status?: string }) =>
      params.status ? reponse([]) : reponse(HISTORIQUE),
    );
    rendre();
    expect(screen.queryByRole('button', { name: /^Payer / })).toBeNull();
    expect(screen.getByText(fr.payments.customer.upToDate)).toBeInTheDocument();
  });

  it('aucun vocabulaire d’agence : ni reversement ni facturation', () => {
    const { container } = rendre();
    expect(container.textContent).not.toMatch(/reversement|factur/i);
  });
});
