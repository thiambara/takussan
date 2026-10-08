/**
 * VERIF-594 passe 4 (P4-2) — une restitution partielle retient le reste : la caution est soldée
 * (`deposit_remaining` à 0) sans être intégrale. Le bandeau dit « partiellement remboursée » et
 * n'offre plus de « Solder le remboursement », que l'API refuserait (`deposit_refund.already_refunded`).
 * Le bouton revient dès qu'il reste à rendre — la retenue annulée par l'agence, par exemple.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { DepositRefundState } from '@/lib/queries/leases';
import { DepositRefundBanner } from '../DepositRefundBanner';

let state: DepositRefundState;

vi.mock('@/lib/queries/leases', () => ({
  useDepositRefundState: () => ({ data: { data: state } }),
}));
vi.mock('../DepositRefundModal', () => ({ DepositRefundModal: () => null }));

const lease = { id: 7, status: 'terminated', deposit_amount: 400_000, currency: 'XOF' } as const;

function partial(remaining: number): DepositRefundState {
  return {
    deposit_amount: 400_000,
    deposit_refunded_amount: 100_000,
    deposit_remaining: remaining,
    deposit_refunded_at: '2026-10-08T10:00:00Z',
    deposit_refund_reason: 'peinture',
    state: 'partial',
    attachments: [],
  };
}

describe('DepositRefundBanner', () => {
  beforeEach(() => {
    state = partial(0);
  });

  it('une restitution partielle dont le reste est retenu n’offre plus de complément', () => {
    render(withIntl(<DepositRefundBanner lease={lease} canRefund />));

    expect(screen.getByText('Caution partiellement remboursée')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('le bouton revient quand il reste à rendre', () => {
    state = partial(300_000);
    render(withIntl(<DepositRefundBanner lease={lease} canRefund />));

    expect(screen.getByRole('button', { name: 'Solder le remboursement' })).toBeInTheDocument();
  });
});
