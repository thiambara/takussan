/**
 * TCK-912 (P07.13) — les tableaux de paiement ont un nom, et leurs boutons « Ouvrir » un contexte.
 *
 * Avant : quatre `<table>` nus, sans `<caption>` (un lecteur d'écran annonce « tableau » sans
 * dire lequel), et un bouton « Ouvrir » répété à chaque ligne des factures et des reversements :
 * dans la liste des boutons, N fois le même nom, sans dire quelle ligne il ouvre.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { Invoice, PaymentHistoryRow, Payout } from '@/types/invoice';
import type { PlatformPayout } from '@/types/super-admin';

import { InvoicesTable } from '../InvoicesTable';
import { PayoutsTable } from '../PayoutsTable';
import { PaymentsHistoryTable } from '../PaymentsHistoryTable';
import { PayoutTable } from '@/components/billing/PayoutTable';

const META = { current_page: 1, last_page: 1, per_page: 20, total: 1 };
const reponse = (rows: unknown[]) => ({ isLoading: false, isError: false, error: null, data: { data: rows, meta: META } });

const FACTURE = {
  id: 3,
  reference_number: 'INV-2026-0003',
  status: 'sent',
  issue_date: '2026-07-01',
  due_date: '2026-07-31',
  total_amount: 250000,
  currency: 'XOF',
} as Invoice;

const REVERSEMENT = {
  id: 5,
  reference_number: 'PO-2026-0005',
  landlord_id: 9,
  status: 'scheduled',
  period_start: '2026-07-01',
  period_end: '2026-07-31',
  gross_amount: 250000,
  net_amount: 225000,
  currency: 'XOF',
} as Payout;

const LIGNE = {
  source: 'lease',
  id: 7,
  reference_number: 'PAY-2026-0007',
  amount: 250000,
  currency: 'XOF',
  payment_method: 'mobile_money',
  status: 'pending',
  paid_amount: 0,
  remaining_amount: 250000,
  date: '2026-07-01',
  booking_id: null,
  lease_id: 1,
} as PaymentHistoryRow;

const REVERSEMENT_PLATEFORME = {
  id: 7,
  agency_id: 3,
  period_start: '2026-09-01',
  period_end: '2026-09-30',
  gross_amount: 500000,
  platform_fee_amount: 50000,
  net_amount: 450000,
  currency: 'XOF',
  status: 'pending',
  processed_at: null,
} as PlatformPayout;

vi.mock('@/lib/queries/payments', () => ({
  useInvoices: () => reponse([FACTURE]),
  usePayouts: () => reponse([REVERSEMENT]),
  usePaymentsHistory: () => reponse([LIGNE]),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/components/property-dashboard/PropertyPagination', () => ({
  PropertyPagination: () => null,
}));

describe('tableaux de paiement — un nom par tableau (caption)', () => {
  it.each([
    ['factures', <InvoicesTable key="f" onSelect={vi.fn()} />, 'Factures'],
    ['reversements', <PayoutsTable key="r" onSelect={vi.fn()} />, 'Reversements'],
    ['historique', <PaymentsHistoryTable key="h" />, 'Historique des paiements'],
    ['reversements plateforme', <PayoutTable key="p" payouts={[REVERSEMENT_PLATEFORME]} />, 'Reversements de la plateforme'],
  ])('%s : la table porte une caption qui la nomme', (_nom, ui, attendu) => {
    render(withIntl(ui));
    const table = screen.getByRole('table', { name: attendu });
    expect(table.querySelector('caption')).not.toBeNull();
  });
});

describe('tableaux de paiement — « Ouvrir » dit quelle ligne il ouvre', () => {
  it('facture : « Ouvrir la facture <référence> »', () => {
    render(withIntl(<InvoicesTable onSelect={vi.fn()} />));
    const bouton = screen.getByRole('button', { name: 'Ouvrir la facture INV-2026-0003' });
    // Le libellé visible reste au début du nom accessible (WCAG 2.5.3, label in name).
    expect(bouton).toHaveTextContent('Ouvrir');
  });

  it('reversement : « Ouvrir le reversement <référence> »', () => {
    render(withIntl(<PayoutsTable onSelect={vi.fn()} />));
    const bouton = screen.getByRole('button', { name: 'Ouvrir le reversement PO-2026-0005' });
    expect(bouton).toHaveTextContent('Ouvrir');
  });
});
