/**
 * TCK-594 (ADR-0039 §5) — une facture émise ne s'efface pas, elle s'annule par un AVOIR. L'écran
 * doit le dire : l'avoir porte son propre titre et nomme la facture qu'il annule, et la facture
 * d'origine liste les avoirs émis sur elle. Un refus du serveur (annuler une facture payée…) se lit
 * dans le dialogue au lieu de disparaître.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { ApiError } from '@/lib/api';
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

function rendre() {
  render(withIntl(<InvoiceDetailDialog invoiceId={12} onClose={() => {}} />));
}

describe("InvoiceDetailDialog — l'avoir se lit des deux côtés (TCK-594)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    INVOICE.current = { ...BASE };
  });

  it("titre un avoir comme un avoir, et nomme la facture qu'il annule", () => {
    INVOICE.current = { ...BASE, id: 13, reference_number: 'AV-2026-0001', kind: 'credit_note', status: 'void', credited_invoice_id: 12 };
    rendre();

    expect(screen.getByText('Avoir AV-2026-0001')).toBeInTheDocument();
    expect(screen.queryByText('Facture AV-2026-0001')).not.toBeInTheDocument();
    expect(screen.getByText('Annule la facture n° 12')).toBeInTheDocument();
  });

  it('liste les avoirs émis sur la facture d’origine', () => {
    INVOICE.current = {
      ...BASE,
      status: 'cancelled',
      credit_notes: [{ id: 13, reference_number: 'AV-2026-0001', total_amount: -100000, currency: 'XOF', issue_date: '2026-10-02' }],
    };
    rendre();

    expect(screen.getByText('Facture FAC-2026-0012')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Avoirs émis sur cette facture' })).toBeInTheDocument();
    expect(screen.getByText('AV-2026-0001')).toBeInTheDocument();
  });

  it("affiche le refus du serveur au lieu de l'avaler", async () => {
    mutation.mutateAsync.mockRejectedValueOnce(
      new ApiError(422, { message: 'Une facture payée ne s’annule pas.', code: 'invoice.cannot_cancel' }),
    );
    rendre();

    fireEvent.click(screen.getByRole('button', { name: 'Annuler la facture' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Une facture payée ne s’annule pas.');
  });
});
