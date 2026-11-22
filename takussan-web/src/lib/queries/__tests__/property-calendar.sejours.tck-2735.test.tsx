/**
 * TCK-2735 (ADR-0102 § 3) — l'onglet Calendrier du bien ne peint en « réservé » que des séjours :
 * la lecture porte `filter[kind]=stay`, à côté de `filter[status]=confirmed`. Une candidature ou une
 * offre confirmée sur un bien devenu loué à la nuit n'y est pas une nuit prise.
 */
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withIntl } from '@/test/intl';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  apiRequest,
}));

const { usePropertyConfirmedStays } = await import('../property-calendar');

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    withIntl(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
  return renderHook(() => usePropertyConfirmedStays(7), { wrapper });
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockResolvedValue({ data: [], meta: { total: 0, per_page: 100, current_page: 1, last_page: 1 } });
});

describe('usePropertyConfirmedStays — des séjours seulement (TCK-2735)', () => {
  it('lit les réservations confirmées du bien de nature « séjour »', async () => {
    const { result } = monter();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const chemin = String(apiRequest.mock.calls[0]?.[0]);
    const params = new URL(chemin, 'http://x').searchParams;
    expect(new URL(chemin, 'http://x').pathname).toBe('/api/bookings');
    expect(params.get('filter[property_id]')).toBe('7');
    expect(params.get('filter[status]')).toBe('confirmed');
    expect(params.get('filter[kind]')).toBe('stay');
  });
});
