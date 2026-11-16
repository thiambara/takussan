/**
 * TCK-2876 — la clé d'une entrée du fil : une réservation a plusieurs jalons sous le MÊME id (sa
 * demande, son acceptation), et deux contre-offres d'une même réservation portent l'id de la
 * réservation (TCK-2873). Ni la lecture des pages ne les fusionne, ni React ne voit deux clés égales.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EntreeDuFil } from '@/lib/queries/customer-timeline';
import { cleDeLEntree, entreesDesPages } from '@/lib/crm/fil-du-client';
import { withIntl } from '@/test/intl';
import type { CustomerDetail } from '@/types/customer';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/app/customers/7',
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton', user: { id: 1 }, isLoading: false }) }));
const api = vi.hoisted(() => ({ fil: vi.fn() }));
vi.mock('@/lib/queries/customer-timeline', async (original) => ({
  ...(await original<typeof import('@/lib/queries/customer-timeline')>()),
  fetchCustomerTimeline: (...a: unknown[]) => api.fil(...a),
}));

import { FilDuClient } from '../FilDuClient';

const reservation = {
  type: 'booking' as const,
  id: 7,
  kind: 'offer' as const,
  status: 'pending',
  reference_number: 'OFF-2611-0007',
  amount: '85000000.00',
  currency: 'XOF',
  start_date: null,
  property: { id: 9, title: 'Villa' },
};
const FIL: EntreeDuFil[] = [
  { ...reservation, at: '2026-11-13T09:00:00+00:00', milestone: 'counter_offer', counter_offer: { id: 502, amount: '88000000.00', valid_until: '2026-11-16', status: 'pending' } },
  { ...reservation, at: '2026-11-12T09:30:00+00:00', milestone: 'counter_offer', counter_offer: { id: 501, amount: '90000000.00', valid_until: '2026-11-15', status: 'superseded' } },
  { ...reservation, at: '2026-11-11T18:00:00+00:00', milestone: 'confirmed' },
  { ...reservation, at: '2026-11-11T16:40:00+00:00', milestone: 'created' },
];

afterEach(() => vi.restoreAllMocks());

describe('TCK-2876 — les clés du fil', () => {
  it('quatre jalons d’une même réservation : quatre clés, aucun ne se perd entre deux pages', () => {
    expect(new Set(FIL.map(cleDeLEntree)).size).toBe(4);
    expect(entreesDesPages([{ data: FIL.slice(0, 2) }, { data: FIL }])).toHaveLength(4);
  });

  it('le rendu ne voit aucune clé en double', async () => {
    const erreurs = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.fil.mockResolvedValue({ data: FIL, meta: { total: 4, per_page: 20, current_page: 1, last_page: 1 } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      withIntl(
        <QueryClientProvider client={client}>
          <FilDuClient customer={{ id: 7, first_name: 'Ibrahima', last_name: 'Sarr' } as CustomerDetail} notes={[]} demandeDeSaisie={null} />
        </QueryClientProvider>,
      ),
    );
    await waitFor(() => expect(api.fil).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector('[data-slot="entrees-du-fil"]')).not.toBeNull());
    const doublons = erreurs.mock.calls.filter((c) => c.some((x) => typeof x === 'string' && /same key/i.test(x)));
    expect(doublons).toEqual([]);
  });
});
