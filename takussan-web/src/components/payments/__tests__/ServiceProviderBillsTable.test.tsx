/**
 * TCK-594 (ADR-0039 §8) — les factures d'intervention, des deux côtés.
 *
 * Le prestataire lit SES factures et leur état, sans aucun geste. L'agence valide (refacturable ou
 * non), rejette avec un motif, ou fait payer une facture validée non refacturable — et le
 * reversement créé s'ouvre pour suivre son approbation. Le dépassement du devis se lit avant le
 * geste. Le serveur juge tout ; ces tests gardent l'accord entre l'écran et lui.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { ServiceProviderBillsTable } from '../ServiceProviderBillsTable';

const VALIDATE = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const REJECT = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const PAY = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const PARAMS = vi.hoisted(() => [] as unknown[]);
const LISTE = vi.hoisted(() => ({
  current: { isLoading: false, isError: false, error: null, data: { data: [] as unknown[] } },
}));
vi.mock('@/lib/queries/payments', () => ({
  useServiceProviderBills: (params: unknown) => {
    PARAMS.push(params);
    return LISTE.current;
  },
  useValidateServiceProviderBill: () => VALIDATE,
  useRejectServiceProviderBill: () => REJECT,
  usePayServiceProviderBill: () => PAY,
}));
const AUTH = vi.hoisted(() => ({ user: { id: 77, agency_id: 3 } }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => AUTH }));

const FACTURE = {
  id: 501,
  maintenance_request_id: 9,
  agency_id: 3,
  property_id: 1,
  provider_id: 77,
  reference_number: 'SPB-2026-0001',
  provider_reference: 'PLB-12',
  amount: 65000,
  currency: 'XOF',
  exceeds_quote: true,
  status: 'pending_validation',
  validated_at: null,
  rejection_reason: null,
  rechargeable_to_landlord: false,
  imputed_payout_id: null,
  created_at: '2026-10-01T10:00:00Z',
};

function avec(...factures: Record<string, unknown>[]) {
  LISTE.current = { isLoading: false, isError: false, error: null, data: { data: factures } };
}

describe('ServiceProviderBillsTable — factures d’intervention (TCK-594)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    PARAMS.length = 0;
    avec(FACTURE);
  });

  it('le prestataire lit ses factures, leur état et le motif d’un rejet, sans aucun geste', () => {
    avec(FACTURE, { ...FACTURE, id: 502, reference_number: 'SPB-2026-0002', status: 'rejected', rejection_reason: 'Pièce non posée.' });
    render(withIntl(<ServiceProviderBillsTable mode="provider" />));

    expect(PARAMS.at(-1)).toEqual({ provider_id: 77 });
    expect(screen.getByText('SPB-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('Pièce non posée.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('l’agence lit le dépassement du devis, puis valide en refacturant au bailleur', async () => {
    VALIDATE.mutateAsync.mockResolvedValue({ data: {} });
    render(withIntl(<ServiceProviderBillsTable mode="agency" />));

    expect(PARAMS.at(-1)).toEqual({ agency_id: 3 });
    expect(screen.getByText('Dépasse le devis approuvé')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Refacturer au bailleur' }));
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }));

    await waitFor(() => expect(VALIDATE.mutateAsync).toHaveBeenCalledWith({ id: 501, rechargeable_to_landlord: true }));
  });

  it('un rejet exige son motif', async () => {
    REJECT.mutateAsync.mockResolvedValue({ data: {} });
    render(withIntl(<ServiceProviderBillsTable mode="agency" />));

    fireEvent.click(screen.getByRole('button', { name: 'Rejeter' }));
    const confirmer = screen.getByRole('button', { name: 'Confirmer le rejet' });
    expect(confirmer).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Motif du rejet'), { target: { value: ' Travaux non conformes ' } });
    fireEvent.click(confirmer);

    await waitFor(() => expect(REJECT.mutateAsync).toHaveBeenCalledWith({ id: 501, rejection_reason: 'Travaux non conformes' }));
  });

  it('paie une facture validée non refacturable, et ouvre le reversement créé', async () => {
    avec(
      { ...FACTURE, status: 'validated', exceeds_quote: false },
      { ...FACTURE, id: 503, reference_number: 'SPB-2026-0003', status: 'validated', rechargeable_to_landlord: true },
    );
    PAY.mutateAsync.mockResolvedValue({ data: { id: 31 } });
    const onPaid = vi.fn();
    render(withIntl(<ServiceProviderBillsTable mode="agency" onPaid={onPaid} />));

    const payer = screen.getAllByRole('button', { name: 'Payer le prestataire' });
    expect(payer).toHaveLength(1);
    expect(screen.getByText('Imputée sur le reversement du bailleur')).toBeInTheDocument();
    fireEvent.click(payer[0]);

    await waitFor(() => expect(onPaid).toHaveBeenCalledWith(31));
    expect(PAY.mutateAsync).toHaveBeenCalledWith({ id: 501 });
  });

  it('dit pourquoi le serveur refuse', async () => {
    const { ApiError } = await import('@/lib/api');
    VALIDATE.mutateAsync.mockRejectedValue(new ApiError(403, { message: 'Vous ne validez pas votre propre facture.', code: 'segregation.approve' }));
    render(withIntl(<ServiceProviderBillsTable mode="agency" />));

    fireEvent.click(screen.getByRole('button', { name: 'Valider' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Vous ne validez pas votre propre facture.');
  });
});
