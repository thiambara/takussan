/**
 * TCK-587 (ADR-0031 §2, AC11) — les actions d'un versement ne sont proposées qu'au personnel
 * tenant `payouts.create`, et jamais au bénéficiaire.
 *
 * Le serveur refuse les deux (`PayoutPolicy::update`) ; avant ce ticket, le bailleur voyait
 * « Marquer effectué » sur son propre versement, et l'API le laissait faire. Ces tests gardent
 * l'accord entre l'écran et le serveur, pas une sécurité.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuth } from '@/context/AuthContext';
import { useCan } from '@/hooks/useCan';
import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import { PayoutDetailDialog } from '../PayoutDetailDialog';

vi.mock('@/hooks/useCan', () => ({ useCan: vi.fn() }));
vi.mock('@/context/AuthContext', () => ({ useAuth: vi.fn() }));

const mutation = { mutateAsync: vi.fn(), isPending: false };
vi.mock('@/lib/queries/payments', () => ({
  usePayout: () => ({
    data: {
      data: {
        id: 7,
        reference_number: 'PO-7',
        landlord_id: 42,
        issued_by_id: 9,
        agency_id: 3,
        status: 'pending',
        gross_amount: 100000,
        commission_amount: 10000,
        net_amount: 90000,
        currency: 'XOF',
        created_at: '2026-10-01T00:00:00Z',
      },
    },
    isLoading: false,
    isError: false,
    error: null,
  }),
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
