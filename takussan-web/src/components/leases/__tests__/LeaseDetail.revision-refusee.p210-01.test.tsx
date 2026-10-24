/**
 * P210.01 (TCK-2080) — une révision de loyer que l'API refuse (motif trop court, plafond dépassé
 * sans `force`, bail hors des statuts révisables) se dit à l'écran par `useMessageErreurApi()`
 * (ADR-0019). Avant, `handleRentReview` attendait `mutateAsync` sans `catch` : après les deux
 * saisies, rien ne se passait, et le rejet sortait non rattrapé.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import { ApiError } from '@/lib/api';
import type { Lease } from '@/types/lease';
import { LeaseDetail } from '../LeaseDetail';

const revision = vi.hoisted(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }));
const toastAdd = vi.hoisted(() => vi.fn());

const etat: { abilities: Lease['abilities'] } = { abilities: undefined };

vi.mock('@/lib/queries/leases', () => {
  const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
  return {
    useLease: () => ({
      data: {
        data: {
          id: 7,
          reference_number: 'BAIL-7',
          status: 'active',
          type: 'residential_rent',
          agency_id: 3,
          landlord_id: 40,
          start_date: '2026-01-01',
          end_date: null,
          monthly_rent: 150000,
          deposit_amount: 300000,
          abilities: etat.abilities,
        },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useLeasePayments: () => ({ data: { data: [] } }),
    useGenerateSchedule: mutation,
    useActivateLease: mutation,
    useReviewLeaseRent: () => revision,
  };
});

vi.mock('../LeaseSchedule', () => ({
  LeaseSchedule: ({
    canRecordPayment,
    canManage,
  }: {
    canRecordPayment?: boolean;
    canManage?: boolean;
  }) => (
    <>
      <p>{canRecordPayment ? 'échéancier : pénalité offerte' : 'échéancier : sans pénalité'}</p>
      <p>{canManage ? 'échéancier : lien offert' : 'échéancier : sans lien'}</p>
    </>
  ),
}));
vi.mock('../DepositRefundBanner', () => ({
  DepositRefundBanner: ({ canRefund }: { canRefund: boolean }) => (
    <p>{canRefund ? 'dépôt : restitution offerte' : 'dépôt : sans restitution'}</p>
  ),
}));
vi.mock('../LeasePaymentDialog', () => ({ LeasePaymentDialog: () => null }));
vi.mock('../GuarantorSection', () => ({
  GuarantorSection: ({ canManage }: { canManage?: boolean }) => (
    <p>{canManage ? 'garant : ajout offert' : 'garant : sans ajout'}</p>
  ),
}));
vi.mock('../LeaseRenewalDialog', () => ({ LeaseRenewalDialog: () => null }));
vi.mock('../LeaseChainTimeline', () => ({ LeaseChainTimeline: () => null }));
vi.mock('../EarlyTerminationDialog', () => ({ EarlyTerminationDialog: () => null }));
vi.mock('../EarlyTerminationBanner', () => ({
  EarlyTerminationBanner: ({ canCancel }: { canCancel?: boolean }) => (
    <p>{canCancel ? 'préavis : annulation offerte' : 'préavis : sans annulation'}</p>
  ),
}));
vi.mock('../LeaseSignaturePanel', () => ({ LeaseSignaturePanel: () => null }));
vi.mock('@/components/documents/AddDocumentButton', () => ({ AddDocumentButton: () => null }));
vi.mock('@/components/reviews/LeaveReviewCta', () => ({ LeaveReviewCta: () => null }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 9, roles: ['agent', 'customer'] }, token: 'jeton' }),
}));

const d = fr.lease.detail;
const MESSAGE_API = 'La variation dépasse le plafond légal';

describe('LeaseDetail — la révision de loyer refusée se dit (P210.01)', () => {
  beforeEach(() => {
    etat.abilities = {
      renew: false,
      review_rent: true,
      record_payment: false,
      refund_deposit: false,
      request_early_termination: false,
      update: true,
    };
    revision.mutateAsync.mockReset();
    toastAdd.mockReset();
    vi.spyOn(window, 'prompt')
      .mockReturnValueOnce('400000')
      .mockReturnValueOnce('Indexation annuelle');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('un refus de l’API affiche son message, sans toast de succès', async () => {
    revision.mutateAsync.mockRejectedValue(new ApiError(422, { message: MESSAGE_API }));
    render(withIntl(<LeaseDetail leaseId={7} />));

    await userEvent.click(screen.getByRole('button', { name: d.reviewRent }));

    expect(revision.mutateAsync).toHaveBeenCalledWith({ new_rent: 400000, reason: 'Indexation annuelle' });
    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_API);
    expect(toastAdd).not.toHaveBeenCalled();
  });

  it('une révision acceptée efface le message d’un refus précédent', async () => {
    revision.mutateAsync
      .mockRejectedValueOnce(new ApiError(422, { message: MESSAGE_API }))
      .mockResolvedValueOnce({});
    render(withIntl(<LeaseDetail leaseId={7} />));

    await userEvent.click(screen.getByRole('button', { name: d.reviewRent }));
    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_API);

    vi.mocked(window.prompt).mockReturnValueOnce('160000').mockReturnValueOnce('Indexation annuelle');
    await userEvent.click(screen.getByRole('button', { name: d.reviewRent }));

    await waitFor(() => expect(toastAdd).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
