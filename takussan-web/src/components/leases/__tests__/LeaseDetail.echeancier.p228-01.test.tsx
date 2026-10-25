/**
 * P228.01 (TCK-2210) — « Générer l'échéancier » ne se monte que là où le geste peut aboutir :
 * `abilities.record_payment` (la route juge `recordPayment`, P46.05) et un bail `active`
 * (`LeaseService::scheduleUnderLock` refuse tout autre statut en 422). Son refus se dit sous les
 * gestes par `useMessageErreurApi()` (ADR-0019). Avant, le bouton suivait le rôle et tout bail non
 * `draft`, et `generateSchedule.mutate({})` n'avait aucun chemin d'erreur : le clic refusé ne
 * disait rien.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import { ApiError } from '@/lib/api';
import type { Lease } from '@/types/lease';
import { LeaseDetail } from '../LeaseDetail';

const echeancier = vi.hoisted(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }));

const etat: { abilities: Lease['abilities']; status: Lease['status'] } = {
  abilities: undefined,
  status: 'active',
};

vi.mock('@/lib/queries/leases', () => {
  const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
  return {
    useLease: () => ({
      data: {
        data: {
          id: 7,
          reference_number: 'BAIL-7',
          status: etat.status,
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
    useGenerateSchedule: () => echeancier,
    useActivateLease: mutation,
    useReviewLeaseRent: mutation,
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
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 9, roles: ['agent', 'customer'] }, token: 'jeton' }),
}));

const d = fr.lease.detail;
const MESSAGE_API = 'Un échéancier existe déjà pour ce bail';

function capacites(recordPayment: boolean): Lease['abilities'] {
  return {
    renew: false,
    review_rent: false,
    record_payment: recordPayment,
    refund_deposit: false,
    request_early_termination: false,
    update: true,
  };
}

describe('LeaseDetail — « Générer l’échéancier » (P228.01)', () => {
  beforeEach(() => {
    etat.abilities = capacites(true);
    etat.status = 'active';
    echeancier.mutate.mockReset();
  });

  it('un refus de l’API se dit sous les gestes', async () => {
    echeancier.mutate.mockImplementation(
      (_vars: unknown, options?: { onError?: (erreur: unknown) => void }) =>
        options?.onError?.(new ApiError(422, { message: MESSAGE_API })),
    );
    render(withIntl(<LeaseDetail leaseId={7} />));

    await userEvent.click(screen.getByRole('button', { name: d.generateSchedule }));

    expect(echeancier.mutate).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_API);
  });

  it('un succès après un refus efface le message', async () => {
    echeancier.mutate
      .mockImplementationOnce(
        (_vars: unknown, options?: { onError?: (erreur: unknown) => void }) =>
          options?.onError?.(new ApiError(422, { message: MESSAGE_API })),
      )
      .mockImplementationOnce(
        (_vars: unknown, options?: { onSuccess?: (donnees: unknown) => void }) =>
          options?.onSuccess?.({ data: { payments_created: 12 } }),
      );
    render(withIntl(<LeaseDetail leaseId={7} />));

    await userEvent.click(screen.getByRole('button', { name: d.generateSchedule }));
    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_API);
    await userEvent.click(screen.getByRole('button', { name: d.generateSchedule }));

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('sans `record_payment`, le bouton n’est pas monté', () => {
    etat.abilities = capacites(false);
    render(withIntl(<LeaseDetail leaseId={7} />));

    expect(screen.queryByRole('button', { name: d.generateSchedule })).toBeNull();
  });

  it.each(['pending_signature', 'terminated', 'expired'] as const)(
    'sur un bail `%s`, le bouton n’est pas monté',
    (statut) => {
      etat.status = statut;
      render(withIntl(<LeaseDetail leaseId={7} />));

      expect(screen.queryByRole('button', { name: d.generateSchedule })).toBeNull();
    },
  );
});
