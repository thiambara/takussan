/**
 * TCK-1833 (P183.02) — le badge « N en retard » de la fiche du bail compte les échéances que l'API
 * dit échues (`is_overdue`, TCK-1831 : règle de `scopeOverdue`), et rien d'autre.
 *
 * Avant : il comptait toute `late` et toute `pending` dont `new Date(due_date) < new Date()`, sans
 * regarder `payment_type` ni `partially_paid` — une restitution de caution due par l'agence et
 * l'échéance du jour passaient en retard, une `partially_paid` échue n'y était pas.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { LeaseWithRelations } from '@/lib/queries/leases';
import type { LeasePayment } from '@/types/lease';

const { etat, mutation } = vi.hoisted(() => ({
  etat: {
    user: null as { id: number; roles: string[] } | null,
    lease: null as LeaseWithRelations | null,
    paiements: [] as LeasePayment[],
  },
  mutation: () => ({ mutate: () => undefined, mutateAsync: async () => undefined, isPending: false }),
}));

vi.mock('@/lib/queries/leases', () => ({
  useLease: () => ({ data: { data: etat.lease }, isLoading: false, isError: false, refetch: vi.fn() }),
  useLeasePayments: () => ({ data: { data: etat.paiements } }),
  useGenerateSchedule: mutation,
  useActivateLease: mutation,
  useReviewLeaseRent: mutation,
  useCancelEarlyTermination: mutation,
  // TCK-596 §4B — le panneau de signature.
  useRequestLeaseSignature: mutation,
  useSendLeaseSignatureCode: mutation,
  useSignLease: mutation,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: etat.user }),
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ add: vi.fn() }),
}));

// Les sous-blocs lourds ne sont pas le sujet : ils ont leurs propres tests.
vi.mock('../LeaseSchedule', () => ({ LeaseSchedule: () => null }));
vi.mock('../LeaseChainTimeline', () => ({ LeaseChainTimeline: () => null }));
vi.mock('../GuarantorSection', () => ({ GuarantorSection: () => null }));
vi.mock('../DepositRefundBanner', () => ({ DepositRefundBanner: () => null }));
vi.mock('../LeaseRenewalDialog', () => ({ LeaseRenewalDialog: () => null }));
vi.mock('../LeasePaymentDialog', () => ({ LeasePaymentDialog: () => null }));
vi.mock('@/components/documents/AddDocumentButton', () => ({ AddDocumentButton: () => null }));
vi.mock('@/components/reviews/LeaveReviewCta', () => ({ LeaveReviewCta: () => null }));
vi.mock('../EarlyTerminationDialog', () => ({
  EarlyTerminationDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="early-termination-dialog-open" /> : null,
}));

import { LeaseDetail } from '../LeaseDetail';

const LOCATAIRE_USER_ID = 30;

function bail(overrides: Partial<LeaseWithRelations> = {}): LeaseWithRelations {
  return {
    id: 1,
    property_id: 10,
    landlord_id: 20,
    tenant_id: 300,
    agency_id: 5,
    booking_id: null,
    renewed_from_lease_id: null,
    reference_number: 'LS-PREAVIS',
    type: 'residential_rent',
    status: 'active',
    start_date: '2026-01-01',
    end_date: '2027-01-01',
    renewal_date: null,
    monthly_rent: 400_000,
    sale_price: null,
    currency: 'XOF',
    deposit_amount: 800_000,
    deposit_refunded_amount: null,
    deposit_refunded_at: null,
    deposit_refund_reason: null,
    commission_amount: null,
    commission_rate: null,
    payment_frequency: 'monthly',
    payment_day: 5,
    terms: null,
    special_conditions: null,
    guarantor_id: null,
    signed_at: '2026-01-01T00:00:00Z',
    terminated_at: null,
    termination_reason: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    tenant: { id: 300, user_id: LOCATAIRE_USER_ID },
    ...overrides,
  };
}

function echeance(p: Partial<LeasePayment> & Pick<LeasePayment, 'id' | 'status' | 'is_overdue'>): LeasePayment {
  return {
    reference_number: null,
    lease_id: 1,
    payer_id: 300,
    collector_id: null,
    amount: 400_000,
    currency: 'XOF',
    payment_method: null,
    payment_type: 'rent',
    period_start: '2026-09-01',
    period_end: '2026-09-30',
    due_date: '2026-09-05',
    paid_at: null,
    paid_amount: 0,
    remaining_amount: 400_000,
    late_fee_amount: null,
    late_fee_applied_at: null,
    late_fee_paid_at: null,
    late_fee_outstanding: 0,
    late_fee_payable_online: false,
    amount_due: 400_000,
    receipt_available: false,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    ...p,
  };
}

function rendre() {
  return render(withIntl(<LeaseDetail leaseId={1} />));
}

describe('LeaseDetail — badge des échéances en retard (TCK-1833, P183.02)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-23T09:00:00Z'));
    etat.lease = bail();
    etat.user = { id: 1, roles: ['agent'] };
    etat.paiements = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('restitution échue, échéance du jour et `partially_paid` échue : badge à 1', () => {
    etat.paiements = [
      echeance({ id: 1, payment_type: 'deposit_refund', status: 'pending', due_date: '2026-09-05', is_overdue: false }),
      echeance({ id: 2, status: 'pending', due_date: '2026-10-23', period_start: '2026-10-01', is_overdue: false }),
      echeance({ id: 3, status: 'partially_paid', due_date: '2026-09-05', paid_amount: 100_000, is_overdue: true }),
    ];
    rendre();

    expect(screen.getByText('1 en retard')).toBeInTheDocument();
    expect(screen.queryByText('2 en retard')).not.toBeInTheDocument();
  });

  it('aucune échéance que l’API dit échue : pas de badge', () => {
    etat.paiements = [echeance({ id: 2, status: 'pending', due_date: '2026-10-23', is_overdue: false })];
    rendre();

    expect(screen.queryByText(/en retard$/)).not.toBeInTheDocument();
  });
});
