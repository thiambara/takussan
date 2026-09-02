/**
 * TCK-505 (défaut #5) — la liste des factures DÉFILE sur mobile au lieu de se compresser.
 *
 * Même défaut et même correctif que `PaymentsHistoryTable` : conteneur `overflow-hidden` → colonnes
 * de droite (montant, statut, « Ouvrir ») coupées sans défilement, dates cassées sur 3 lignes.
 * Voir l'en-tête de `PaymentsHistoryTable.test.tsx` pour ce que ces tests gardent, et ce que jsdom
 * ne peut pas mesurer.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { conteneurDefilant, porteUnRognageHorizontal } from '@/test/defilement-horizontal';
import fr from '@/messages/fr.json';
import type { Invoice } from '@/types/invoice';
import { InvoicesTable } from '../InvoicesTable';

const useInvoices = vi.fn();

vi.mock('@/lib/queries/payments', () => ({
  useInvoices: (...args: unknown[]) => useInvoices(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/components/property-dashboard/PropertyPagination', () => ({
  PropertyPagination: () => null,
}));

const FACTURE: Invoice = {
  id: 3,
  reference_number: 'INV-2026-0003',
  invoiceable_id: 1,
  invoiceable_type: 'lease',
  customer_id: 1,
  issued_by_id: 2,
  agency_id: 1,
  status: 'sent',
  issue_date: '2026-07-01',
  due_date: '2026-07-31',
  subtotal: 250000,
  tax_rate: null,
  tax_amount: null,
  total_amount: 250000,
  currency: 'XOF',
  notes: null,
  created_at: '2026-07-01T00:00:00+00:00',
};

function rendre() {
  return render(withIntl(<InvoicesTable onSelect={vi.fn()} />));
}

beforeEach(() => {
  vi.clearAllMocks();
  useInvoices.mockReturnValue({
    isLoading: false,
    isError: false,
    error: null,
    data: {
      data: [FACTURE],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
    },
  });
});

describe('InvoicesTable — défilement horizontal sur petit écran (TCK-505 #5)', () => {
  it('enveloppe la table dans un conteneur qui DÉFILE en X, sans rognage sur le même élément', () => {
    const { container } = rendre();
    const table = screen.getByRole('table');

    const conteneur = conteneurDefilant(table, container);
    expect(conteneur, 'aucun ancêtre défilant avant un ancêtre rognant').not.toBeNull();
    expect(porteUnRognageHorizontal(conteneur!)).toBe(false);
    expect(conteneur).toHaveClass('rounded-xl', 'border');
  });

  it('ne laisse pas les dates, le montant ni le statut revenir à la ligne', () => {
    rendre();
    const { issuedOn, dueDate, amount, status } = fr.payments.invoices.table;

    for (const libelle of [issuedOn, dueDate, amount, status]) {
      expect(screen.getByRole('columnheader', { name: libelle })).toHaveClass('whitespace-nowrap');
    }
    expect(screen.getByRole('cell', { name: '1 juil. 2026' })).toHaveClass('whitespace-nowrap');
    expect(screen.getByRole('cell', { name: '31 juil. 2026' })).toHaveClass('whitespace-nowrap');
    expect(screen.getByRole('cell', { name: /250\s?000/ })).toHaveClass('whitespace-nowrap');
    expect(screen.getByRole('cell', { name: fr.payments.invoiceStatus.sent })).toHaveClass(
      'whitespace-nowrap',
    );
  });
});
