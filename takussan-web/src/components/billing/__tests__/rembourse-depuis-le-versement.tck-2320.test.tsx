import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { PlatformPayout } from '@/types/super-admin';

/**
 * TCK-2320 (P39.07) — un reversement de la plateforme déjà versé dont une ligne a été remboursée
 * depuis est signalé à la console : une pastille dans la liste, et les références dans le détail.
 * Aucun montant : la compensation n'est pas décidée.
 */
const API = vi.hoisted(() => ({
  fetchAdminPlatformPayout: vi.fn(),
  approveAdminPlatformPayout: vi.fn(),
  markAdminPlatformPayoutPaid: vi.fn(),
  cancelAdminPlatformPayout: vi.fn(),
}));
vi.mock('@/lib/queries/super-admin', () => API);
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 3 } }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

import { PayoutDetailPanel } from '../PayoutDetailPanel';
import { PayoutTable } from '../PayoutTable';

const VERSE: PlatformPayout = {
  id: 7,
  agency_id: 3,
  period_start: '2026-09-01',
  period_end: '2026-09-30',
  gross_amount: 500000,
  platform_fee_amount: 50000,
  net_amount: 450000,
  currency: 'XOF',
  status: 'paid',
  approved_by: 2,
  processed_at: '2026-10-01T10:00:00+00:00',
  failure_reason: null,
  metadata: null,
  refunded_since_paid: [
    { payment_type: 'lease_payment', payment_id: 11, reference_number: 'LPY-AAA', refunded_at: '2026-10-12T10:00:00+00:00' },
    { payment_type: 'booking_payment', payment_id: 4, reference_number: 'BPY-BBB', refunded_at: '2026-10-13T10:00:00+00:00' },
  ],
  created_at: null,
  updated_at: null,
};

describe('Reversement remboursé depuis son versement', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('la liste porte une pastille sur le seul reversement signalé', () => {
    render(withIntl(<PayoutTable payouts={[VERSE, { ...VERSE, id: 8, refunded_since_paid: [] }]} />));

    expect(screen.getAllByText('Remboursé depuis')).toHaveLength(1);
  });

  it('le détail cite les références, sans montant', async () => {
    API.fetchAdminPlatformPayout.mockResolvedValue({ data: VERSE });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      withIntl(
        <QueryClientProvider client={client}>
          <PayoutDetailPanel payoutId={7} onClose={vi.fn()} />
        </QueryClientProvider>,
      ),
    );

    const avis = await screen.findByRole('status');
    expect(avis).toHaveTextContent('2 lignes ont été remboursées depuis le versement : LPY-AAA, BPY-BBB.');
    expect(avis).toHaveTextContent("Aucun montant n'est retenu automatiquement.");
  });
});
