import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { PlatformPayout } from '@/types/super-admin';

/**
 * TCK-1370 (P114.03) — « Annuler » reste désactivé tant que le motif, espaces retirés, compte moins
 * de 3 caractères (`CancelPlatformPayoutRequest` : `min:3`). Il ne se désactivait que sur un motif
 * vide : « ab » partait, et l'API répondait 422.
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

const EN_ATTENTE: PlatformPayout = {
  id: 7,
  agency_id: 3,
  period_start: '2026-09-01',
  period_end: '2026-09-30',
  gross_amount: 500000,
  platform_fee_amount: 50000,
  net_amount: 450000,
  currency: 'XOF',
  status: 'pending',
  closed_by_id: 1,
  approved_by: null,
  processed_at: null,
  failure_reason: null,
  metadata: null,
  created_at: null,
  updated_at: null,
};

async function motif(valeur: string): Promise<HTMLElement> {
  fireEvent.change(await screen.findByPlaceholderText("Raison de l'annulation"), { target: { value: valeur } });

  return screen.getByRole('button', { name: 'Annuler' });
}

describe('<PayoutDetailPanel> — borne du motif d’annulation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    API.fetchAdminPlatformPayout.mockResolvedValue({ data: EN_ATTENTE });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      withIntl(
        <QueryClientProvider client={client}>
          <PayoutDetailPanel payoutId={7} onClose={vi.fn()} />
        </QueryClientProvider>,
      ),
    );
  });

  it('2 caractères : désactivé', async () => {
    expect(await motif('ab')).toBeDisabled();
  });

  it('3 caractères entourés d’espaces, dont 2 utiles : désactivé', async () => {
    expect(await motif('  ab ')).toBeDisabled();
  });

  it('3 caractères : actif', async () => {
    expect(await motif('abc')).toBeEnabled();
  });
});
