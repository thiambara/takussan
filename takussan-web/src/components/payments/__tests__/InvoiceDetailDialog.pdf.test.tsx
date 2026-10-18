/**
 * TCK-837 (P26.04) — la facture PDF (`GET /api/invoices/{id}/pdf`) n'avait aucun appelant : la
 * modale de détail est l'écran d'où elle se télécharge. La route et le détail passent par la même
 * règle (`InvoicePolicy::view`) : qui voit la modale peut télécharger le PDF.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { InvoiceDetailDialog } from '../InvoiceDetailDialog';

const mutation = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const INVOICE = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const REPONSE = vi.hoisted(() => ({ isLoading: false, isError: false, error: null, data: { data: {} } }));
vi.mock('@/lib/queries/payments', () => ({
  useInvoice: () => {
    REPONSE.data.data = INVOICE.current;
    return REPONSE;
  },
  useInvoiceSend: () => mutation,
  useInvoiceMarkPaid: () => mutation,
  useInvoiceCancel: () => mutation,
}));
const PROVIDERS = vi.hoisted(() => ({ providers: [] }));
vi.mock('@/hooks/usePaymentProviders', () => ({ usePaymentProviders: () => PROVIDERS }));
vi.mock('../PayOnlineButton', () => ({ PayOnlineButton: () => null }));

const telecharger = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useTelechargementApi', () => ({
  useTelechargementApi: () => ({ telecharger, enCours: false, echec: null }),
}));

const BASE = {
  id: 12,
  reference_number: 'FAC-2026-0012',
  status: 'sent',
  kind: 'invoice',
  credited_invoice_id: null,
  agency_id: 3,
  subtotal: 100000,
  total_amount: 100000,
  currency: 'XOF',
  issue_date: '2026-10-01',
};

describe('InvoiceDetailDialog — téléchargement du PDF (TCK-837)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    INVOICE.current = { ...BASE };
  });

  it('télécharge la facture par /api/invoices/{id}/pdf', () => {
    render(withIntl(<InvoiceDetailDialog invoiceId={12} onClose={() => {}} />));

    fireEvent.click(screen.getByRole('button', { name: /PDF de la facture/ }));

    expect(telecharger).toHaveBeenCalledWith('/api/invoices/12/pdf', 'facture-FAC-2026-0012.pdf');
  });

  it("nomme le fichier d'un avoir comme un avoir", () => {
    INVOICE.current = { ...BASE, id: 13, reference_number: 'AV-2026-0001', kind: 'credit_note', status: 'void', credited_invoice_id: 12 };
    render(withIntl(<InvoiceDetailDialog invoiceId={13} onClose={() => {}} />));

    fireEvent.click(screen.getByRole('button', { name: /PDF de l'avoir/ }));

    expect(telecharger).toHaveBeenCalledWith('/api/invoices/13/pdf', 'avoir-AV-2026-0001.pdf');
  });
});
