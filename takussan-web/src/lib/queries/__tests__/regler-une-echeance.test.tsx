/**
 * TCK-681 (P13.01) — régler une échéance de loyer passe par `POST /api/lease-payments/{id}/mark-paid`,
 * la voie gardée (verrou, checkout ouvert, caution), et non par la création d'une échéance.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useMarkLeasePaymentPaid } from '../leases';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'jeton', user: { id: 1 } }),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'fr',
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useMarkLeasePaymentPaid', () => {
  it('poste sur mark-paid de l’échéance, sans l’identifiant dans le corps, puis rafraîchit le bail', async () => {
    const espion = vi.fn(async (..._args: Parameters<typeof fetch>): Promise<unknown> => ({
      ok: true,
      status: 200,
      json: async () => ({ data: {} }),
      text: async () => '{}',
    }));
    vi.stubGlobal('fetch', espion);
    const client = new QueryClient();
    const invalider = vi.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useMarkLeasePaymentPaid(7), { wrapper });
    await result.current.mutateAsync({ paymentId: 13, paid_at: '2026-05-03', transaction_id: 'REC-42' });

    expect(espion).toHaveBeenCalledTimes(1);
    const [url, init] = espion.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/lease-payments\/13\/mark-paid$/);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ paid_at: '2026-05-03', transaction_id: 'REC-42' });
    await waitFor(() =>
      expect(invalider).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['leases', 'payments', 7] })),
    );
  });
});
