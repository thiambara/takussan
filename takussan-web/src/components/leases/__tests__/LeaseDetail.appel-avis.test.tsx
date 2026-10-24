/**
 * P201.02 (TCK-2035) — l'appel « Partagez votre expérience » de la fiche d'un bail ne se monte
 * pas pour la gestion : le dépôt n'accepte que le locataire du bail (`ReviewEligibility::leasesOf`,
 * `tenant.user_id`), et la fiche de réservation écarte déjà la gestion (`!isDashboardAgent`).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { LeaseWithRelations } from '@/lib/queries/leases';

const { etat, mutation } = vi.hoisted(() => ({
  etat: {
    user: null as { id: number; roles: string[] } | null,
    lease: null as LeaseWithRelations | null,
  },
  mutation: () => ({ mutate: () => undefined, mutateAsync: async () => undefined, isPending: false }),
}));

vi.mock('@/lib/queries/leases', () => ({
  useLease: () => ({ data: { data: etat.lease }, isLoading: false, isError: false, refetch: vi.fn() }),
  useLeasePayments: () => ({ data: { data: [] } }),
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
vi.mock('@/components/reviews/LeaveReviewCta', () => ({
  LeaveReviewCta: () => <div data-testid="appel-avis" />,
}));
vi.mock('../EarlyTerminationDialog', () => ({ EarlyTerminationDialog: () => null }));

import { LeaseDetail } from '../LeaseDetail';

const LOCATAIRE_USER_ID = 30;

const PREAVIS_REFUSE = {
  renew: false,
  review_rent: false,
  record_payment: false,
  refund_deposit: false,
  request_early_termination: false,
  update: false,
};

function bail(overrides: Partial<LeaseWithRelations> = {}): LeaseWithRelations {
  return {
    id: 1,
    property_id: 10,
    landlord_id: 20,
    tenant_id: 300,
    agency_id: 5,
    booking_id: null,
    renewed_from_lease_id: null,
    reference_number: 'LS-AVIS',
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
    property: { id: 10, title: 'Villa Almadies', slug: 'villa-almadies', main_photo_url: null },
    abilities: PREAVIS_REFUSE,
    ...overrides,
  };
}

function rendre(roles: string[], id = 99) {
  etat.user = { id, roles };
  etat.lease = bail();
  return render(withIntl(<LeaseDetail leaseId={1} />));
}

describe('LeaseDetail — appel à l\'avis (P201.02)', () => {
  it.each([['agent'], ['owner'], ['agency_admin'], ['super_admin']])(
    'ne monte pas l\'appel pour le rôle de gestion %s',
    (role) => {
      rendre([role]);
      expect(screen.queryByTestId('appel-avis')).toBeNull();
    },
  );

  it('monte l\'appel pour le locataire du bail', () => {
    rendre(['customer'], LOCATAIRE_USER_ID);
    expect(screen.getByTestId('appel-avis')).toBeTruthy();
  });
});
