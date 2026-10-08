/**
 * TCK-587 (ADR-0031 §2, AC11) — les actions d'un versement ne sont proposées qu'au personnel
 * tenant `payouts.create`, et jamais au bénéficiaire.
 *
 * Le serveur refuse les deux (`PayoutPolicy::update`) ; avant ce ticket, le bailleur voyait
 * « Marquer effectué » sur son propre versement, et l'API le laissait faire. Ces tests gardent
 * l'accord entre l'écran et le serveur, pas une sécurité.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuth } from '@/context/AuthContext';
import { useCan } from '@/hooks/useCan';
import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import { PayoutDetailDialog } from '../PayoutDetailDialog';

vi.mock('@/hooks/useCan', () => ({ useCan: vi.fn() }));
vi.mock('@/context/AuthContext', () => ({ useAuth: vi.fn() }));

const mutation = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const PAYOUT = vi.hoisted(() => ({
  current: {
    id: 7,
    reference_number: 'PO-7',
    landlord_id: 42,
    issued_by_id: 9,
    approved_by_id: null as number | null,
    agency_id: 3,
    status: 'pending',
    gross_amount: 100000,
    commission_amount: 10000,
    net_amount: 90000,
    currency: 'XOF',
    payment_method: null as string | null,
    created_at: '2026-10-01T00:00:00Z',
  },
}));
const REPONSE = vi.hoisted(() => ({ isLoading: false, isError: false, error: null, data: { data: {} } }));
vi.mock('@/lib/queries/payments', () => ({
  usePayout: () => {
    REPONSE.data.data = PAYOUT.current;
    return REPONSE;
  },
  usePayoutApprove: () => mutation,
  usePayoutMarkProcessed: () => mutation,
  usePayoutMarkFailed: () => mutation,
  usePayoutCancel: () => mutation,
}));

const MARQUER = fr.payments.payoutDetail.markProcessed;
const ANNULER = fr.payments.payoutDetail.cancel;

function en(userId: number, capacites: readonly string[]) {
  vi.mocked(useAuth).mockReturnValue({ user: { id: userId } } as ReturnType<typeof useAuth>);
  vi.mocked(useCan).mockImplementation((capability) => ({
    can: capacites.includes(capability),
    isLoading: false,
  }));
}

function rendre() {
  render(withIntl(<PayoutDetailDialog payoutId={7} onClose={() => {}} />));
}

describe('PayoutDetailDialog — actions gardées par capacité et bénéficiaire (TCK-587)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    PAYOUT.current = { ...PAYOUT.current, status: 'pending', approved_by_id: null, payment_method: null };
  });

  it('ne propose aucune action au bailleur bénéficiaire', () => {
    en(42, []);
    rendre();

    expect(screen.getByText('PO-7', { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: MARQUER })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ANNULER })).not.toBeInTheDocument();
  });

  it('propose les actions à l’admin d’agence qui tient payouts.create', () => {
    en(9, ['payouts.create']);
    rendre();

    expect(screen.getByRole('button', { name: MARQUER })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ANNULER })).toBeInTheDocument();
  });

  it('ne les propose pas au bénéficiaire même s’il tient payouts.create', () => {
    en(42, ['payouts.create']);
    rendre();

    expect(screen.queryByRole('button', { name: MARQUER })).not.toBeInTheDocument();
  });

  it('ne les propose pas à un membre sans payouts.create', () => {
    en(9, []);
    rendre();

    expect(screen.queryByRole('button', { name: MARQUER })).not.toBeInTheDocument();
  });
});

const APPROUVER = fr.payments.payoutDetail.approve;

describe('PayoutDetailDialog — les quatre yeux se disent (TCK-594, ADR-0039 §4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    PAYOUT.current = { ...PAYOUT.current, status: 'awaiting_approval', approved_by_id: null, payment_method: null };
  });

  it("refuse VISIBLEMENT l'approbation à celui qui a préparé", () => {
    en(9, ['payouts.create', 'payouts.approve']);
    rendre();

    expect(screen.getByText(fr.payments.payoutDetail.approveSelfRefused)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: APPROUVER })).toBeDisabled();
  });

  it('laisse approuver un second membre qui tient payouts.approve', () => {
    en(11, ['payouts.approve']);
    rendre();

    expect(screen.getByRole('button', { name: APPROUVER })).toBeEnabled();
    expect(screen.queryByText(fr.payments.payoutDetail.approveSelfRefused)).not.toBeInTheDocument();
  });

  it("dit à l'approbateur qu'il ne paie pas, et exige la référence hors espèces", () => {
    PAYOUT.current = { ...PAYOUT.current, status: 'pending', approved_by_id: 11, payment_method: 'wave' };
    en(11, ['payouts.create', 'payouts.approve']);
    rendre();

    expect(screen.getByText(fr.payments.payoutDetail.paySelfRefused)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: MARQUER })).toBeDisabled();
  });

  it('le payeur ne marque payé qu’avec la référence de la transaction', async () => {
    PAYOUT.current = { ...PAYOUT.current, status: 'pending', approved_by_id: 11, payment_method: 'wave' };
    en(9, ['payouts.create']);
    rendre();

    const bouton = screen.getByRole('button', { name: MARQUER });
    expect(bouton).toBeDisabled();
    fireEvent.change(screen.getByLabelText(fr.payments.payoutDetail.transactionId), { target: { value: 'WAVE-778' } });
    expect(bouton).toBeEnabled();
  });
});
