/**
 * TCK-596 §1 (AC1) — le locataire de CE bail donne son préavis depuis son espace.
 *
 * L'API l'autorise (`LeasePolicy::requestEarlyTermination`, `cancelEarlyTermination`) ; le front le
 * cachait : `canRequestTermination` valait le drapeau des rôles de gestion. Trois cas, et le
 * deuxième est celui qui interdit le mauvais correctif (« tout client voit le geste ») :
 *
 * - le locataire du bail voit « Donner mon préavis », l'ouvre, et peut retirer sa demande ;
 * - un client qui n'est pas ce locataire ne voit rien ;
 * - l'agent garde son geste de gestion, inchangé.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

function rendre() {
  return render(withIntl(<LeaseDetail leaseId={1} />));
}

describe('LeaseDetail — préavis du locataire (TCK-596 §1)', () => {
  beforeEach(() => {
    etat.lease = bail();
    etat.user = null;
  });

  it('le locataire du bail voit « Donner mon préavis » et ouvre le dialogue', () => {
    etat.user = { id: LOCATAIRE_USER_ID, roles: ['customer'] };
    rendre();

    const geste = screen.getByRole('button', { name: 'Donner mon préavis' });
    fireEvent.click(geste);

    expect(screen.getByTestId('early-termination-dialog-open')).toBeInTheDocument();
    // Le geste de gestion n'apparaît pas sous son libellé de gestionnaire.
    expect(screen.queryByRole('button', { name: 'Résilier le bail' })).not.toBeInTheDocument();
  });

  it('le locataire retire sa demande depuis la bannière tant que la fenêtre est ouverte', () => {
    etat.user = { id: LOCATAIRE_USER_ID, roles: ['customer'] };
    etat.lease = bail({
      status: 'terminating',
      early_termination_requested_at: '2026-04-25T10:00:00Z',
      early_termination_effective_date: new Date(Date.now() + 30 * 86_400_000)
        .toISOString()
        .slice(0, 10),
    });
    rendre();

    expect(screen.getByTestId('early-termination-banner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annuler la résiliation' })).toBeInTheDocument();
  });

  it("un client qui n'est pas le locataire de ce bail ne voit pas le geste", () => {
    etat.user = { id: 999, roles: ['customer'] };
    rendre();

    expect(screen.queryByRole('button', { name: 'Donner mon préavis' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Résilier le bail' })).not.toBeInTheDocument();
  });

  it('un bail sans compte locataire ne donne le geste à aucun client', () => {
    etat.user = { id: LOCATAIRE_USER_ID, roles: ['customer'] };
    etat.lease = bail({ tenant: { id: 300, user_id: null } });
    rendre();

    expect(screen.queryByRole('button', { name: 'Donner mon préavis' })).not.toBeInTheDocument();
  });

  it("l'agent garde son geste de gestion, inchangé", () => {
    etat.user = { id: 77, roles: ['agent'] };
    rendre();

    expect(screen.getByRole('button', { name: 'Résilier le bail' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Donner mon préavis' })).not.toBeInTheDocument();
  });
});

describe('LeaseDetail — signature du bail (TCK-596 §4B)', () => {
  beforeEach(() => {
    etat.user = { id: 77, roles: ['agent'] };
  });

  it("le brouillon n'offre plus l'« Activer » sans preuve : le gestionnaire demande la signature", () => {
    etat.lease = bail({ status: 'draft', signed_at: null, can_request_signature: true, can_sign_as: [] });
    rendre();

    expect(screen.queryByRole('button', { name: 'Activer le bail' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Demander la signature' })).toBeInTheDocument();
  });

  it("un bail actif n'affiche pas le panneau de signature", () => {
    etat.lease = bail({ status: 'active' });
    rendre();

    expect(screen.queryByTestId('lease-signature-panel')).not.toBeInTheDocument();
  });
});
