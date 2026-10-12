import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { cancelBoost, fetchAdminBoosts, fetchBoostProducts, offerBoost } from '@/components/boost/admin/api';
import { AdminBoosts } from '../AdminBoosts';

vi.mock('@/components/boost/admin/api', () => ({
  fetchAdminBoosts: vi.fn(),
  fetchBoostProducts: vi.fn(),
  cancelBoost: vi.fn(),
  offerBoost: vi.fn(),
}));

function rendre(noeud: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{noeud}</QueryClientProvider>));
}

const BOOST = {
  id: 31, property_id: 4, agency_id: 7, kind: 'featured', variant: null, status: 'active', price_credits: 20,
  duration_days: 7, starts_at: '2026-10-12T10:00:00+00:00', ends_at: '2026-10-19T10:00:00+00:00', ended_at: null,
  remaining_seconds: null, offered: false, offer_reason: null, refunded_credits: null, cancel_reason: null,
  property: { id: 4, title: 'Villa à Saly', slug: 'villa-saly' }, agency: { id: 7, name: 'Agence Teranga' },
} as const;

describe('AdminBoosts (TCK-633 lot F, AC16)', () => {
  it('annule avec remboursement et motif', async () => {
    vi.mocked(fetchAdminBoosts).mockResolvedValue({ data: [BOOST], meta: { current_page: 1, last_page: 1, per_page: 25, total: 1 } });
    vi.mocked(fetchBoostProducts).mockResolvedValue({ data: [] });
    vi.mocked(cancelBoost).mockResolvedValue({ data: { ...BOOST, status: 'refunded' } });
    vi.mocked(offerBoost).mockResolvedValue({ data: BOOST });
    const user = userEvent.setup();
    rendre(<AdminBoosts />);

    await user.click(await screen.findByRole('button', { name: 'Annuler' }));
    await user.click(screen.getByLabelText('Rembourser les jours pleins restants'));
    await user.type(screen.getByLabelText('Motif de l’annulation'), 'Annonce en double');
    await user.click(screen.getByRole('button', { name: 'Confirmer l’annulation' }));

    await waitFor(() => expect(cancelBoost).toHaveBeenCalledWith(31, { refund: true, reason: 'Annonce en double' }));
  });
});
