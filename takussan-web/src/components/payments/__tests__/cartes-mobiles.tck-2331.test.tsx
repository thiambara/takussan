/**
 * TCK-2331 (P08.07) — les factures et l'historique des paiements passent en CARTES sous `md`
 * (`DataTable` `carteMobile`). Sur téléphone, « Ouvrir » et le lien vers le bail ne
 * s'atteignaient qu'après un défilement horizontal de la table.
 *
 * jsdom n'applique pas `md:hidden` : la table et les cartes sont toutes deux dans le DOM, et ce
 * test lit les cartes DANS leur liste.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import type { Invoice, PaymentHistoryRow } from '@/types/invoice';

import { InvoicesTable } from '../InvoicesTable';
import { PaymentsHistoryTable } from '../PaymentsHistoryTable';

const META = { current_page: 1, last_page: 1, per_page: 20, total: 1 };
const reponse = (rows: unknown[], meta: Record<string, unknown> = META) => ({
  isLoading: false,
  isError: false,
  error: null,
  data: { data: rows, meta },
});

const FACTURE = {
  id: 3,
  reference_number: 'INV-2026-0003',
  status: 'sent',
  issue_date: '2026-07-01',
  due_date: '2026-07-31',
  total_amount: 250000,
  currency: 'XOF',
} as Invoice;

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

vi.mock('@/lib/queries/payments', () => ({
  useInvoices: () => reponse([FACTURE]),
  usePaymentsHistory: () => reponse([LIGNE], { ...META, totals: null }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/components/property-dashboard/PropertyPagination', () => ({
  PropertyPagination: () => null,
}));

describe('factures — cartes sous md', () => {
  it('une carte par facture : référence, montant, statut, et « Ouvrir » qui ouvre la facture', () => {
    const onSelect = vi.fn();
    render(withIntl(<InvoicesTable onSelect={onSelect} />));

    const liste = screen.getByRole('list', { name: fr.payments.invoices.table.caption });
    expect(liste).toHaveClass('md:hidden');
    const [carte] = within(liste).getAllByRole('listitem');
    expect(carte).toHaveTextContent('INV-2026-0003');
    expect(carte).toHaveTextContent(/250\s?000/);
    expect(carte).toHaveTextContent(fr.payments.invoiceStatus.sent);
    expect(carte).toHaveTextContent('31 juil. 2026');

    fireEvent.click(within(carte).getByRole('button', { name: 'Ouvrir la facture INV-2026-0003' }));
    expect(onSelect).toHaveBeenCalledWith(3);
  });
});

describe('historique des paiements — cartes sous md', () => {
  it('une carte par paiement : référence, montant, statut, moyen, et le lien vers le bail', () => {
    render(withIntl(<PaymentsHistoryTable />));

    const liste = screen.getByRole('list', { name: fr.payments.history.table.caption });
    expect(liste).toHaveClass('md:hidden');
    const [carte] = within(liste).getAllByRole('listitem');
    expect(carte).toHaveTextContent('PAY-2026-0007');
    expect(carte).toHaveTextContent(/250\s?000/);
    expect(carte).toHaveTextContent(fr.payments.status.pending);
    expect(carte).toHaveTextContent(fr.payments.methods.mobile_money);
    expect(within(carte).getByRole('link', { name: 'Bail #1' })).toHaveAttribute('href', '/app/leases/1');
  });
});
