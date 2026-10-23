/**
 * P152.02 — la fiche d'un bail ne monte « Renouveler », « Réviser le loyer », « Enregistrer un
 * paiement », la restitution du dépôt et la pénalité de l'échéancier que sous le drapeau que l'API
 * rend dans `abilities` (`LeasePolicy`). Avant, tout rôle de gestion les voyait, et l'API rendait 403.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import type { Lease } from '@/types/lease';
import { LeaseDetail } from '../LeaseDetail';

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

describe('LeaseDetail — gestes jugés par capacité (P152.02)', () => {
  it('un agent sans les capacités ne voit aucun des quatre gestes', () => {
    etat.abilities = {
      renew: false,
      review_rent: false,
      record_payment: false,
      refund_deposit: false,
      request_early_termination: true,
      update: true,
    };
    render(withIntl(<LeaseDetail leaseId={7} />));

    expect(screen.queryByRole('button', { name: d.reviewRent })).toBeNull();
    expect(screen.queryByRole('button', { name: d.recordPayment })).toBeNull();
    expect(screen.queryByRole('button', { name: fr.lease.renewal.cta })).toBeNull();
    expect(screen.getByText('dépôt : sans restitution')).toBeInTheDocument();
    expect(screen.getByText('échéancier : sans pénalité')).toBeInTheDocument();
    // Les gestes qu'une autre règle juge restent au gestionnaire.
    expect(screen.getByRole('button', { name: d.generateSchedule })).toBeInTheDocument();
  });

  it('chaque geste suit son drapeau', () => {
    etat.abilities = {
      renew: true,
      review_rent: false,
      record_payment: true,
      refund_deposit: true,
      request_early_termination: true,
      update: true,
    };
    render(withIntl(<LeaseDetail leaseId={7} />));

    expect(screen.getByRole('button', { name: fr.lease.renewal.cta })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: d.recordPayment })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: d.reviewRent })).toBeNull();
    expect(screen.getByText('dépôt : restitution offerte')).toBeInTheDocument();
    expect(screen.getByText('échéancier : pénalité offerte')).toBeInTheDocument();
  });

  it('sans `abilities`, rien n’est offert', () => {
    etat.abilities = undefined;
    render(withIntl(<LeaseDetail leaseId={7} />));

    expect(screen.queryByRole('button', { name: fr.lease.renewal.cta })).toBeNull();
    expect(screen.queryByRole('button', { name: d.recordPayment })).toBeNull();
  });
});

/**
 * P189.03 (TCK-1871) — le préavis et son annulation suivent `request_early_termination`, l'ajout de
 * garant et le lien de paiement de l'échéancier suivent `update` : la fiche les ouvrait par le rôle,
 * que le bailleur suspendu garde, et montrait le préavis à l'agent sans `leases.terminate`.
 */
describe('LeaseDetail — préavis, garant et lien de paiement par `abilities` (P189.03)', () => {
  const quatreGestes = { renew: false, review_rent: false, record_payment: false, refund_deposit: false };

  it('le bailleur suspendu ne se voit offrir aucun des trois', () => {
    etat.abilities = { ...quatreGestes, request_early_termination: false, update: false };
    render(withIntl(<LeaseDetail leaseId={7} />));

    expect(screen.queryByRole('button', { name: fr.lease.early_termination.cta })).toBeNull();
    expect(screen.getByText('préavis : sans annulation')).toBeInTheDocument();
    expect(screen.getByText('garant : sans ajout')).toBeInTheDocument();
    expect(screen.getByText('échéancier : sans lien')).toBeInTheDocument();
  });

  it('l’agent sans `leases.terminate` gère le bail sans préavis', () => {
    etat.abilities = { ...quatreGestes, request_early_termination: false, update: true };
    render(withIntl(<LeaseDetail leaseId={7} />));

    expect(screen.queryByRole('button', { name: fr.lease.early_termination.cta })).toBeNull();
    expect(screen.getByText('préavis : sans annulation')).toBeInTheDocument();
    expect(screen.getByText('garant : ajout offert')).toBeInTheDocument();
    expect(screen.getByText('échéancier : lien offert')).toBeInTheDocument();
  });

  it('le préavis s’ouvre quand l’API l’accorde', () => {
    etat.abilities = { ...quatreGestes, request_early_termination: true, update: false };
    render(withIntl(<LeaseDetail leaseId={7} />));

    expect(screen.getByRole('button', { name: fr.lease.early_termination.cta })).toBeInTheDocument();
    expect(screen.getByText('préavis : annulation offerte')).toBeInTheDocument();
  });

  it('sans `abilities`, aucun des trois', () => {
    etat.abilities = undefined;
    render(withIntl(<LeaseDetail leaseId={7} />));

    expect(screen.queryByRole('button', { name: fr.lease.early_termination.cta })).toBeNull();
    expect(screen.getByText('garant : sans ajout')).toBeInTheDocument();
    expect(screen.getByText('échéancier : sans lien')).toBeInTheDocument();
  });
});
