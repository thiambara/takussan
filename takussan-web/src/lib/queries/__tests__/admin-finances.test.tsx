import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import {
  usePendingPayoutsCount,
  useDraftInvoicesCount,
} from '../admin-finances';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'fr',
}));

function mockFetch(payload: unknown) {
  const fakeResponse = {
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
  const spy = vi.fn(
    async (..._args: Parameters<typeof fetch>): Promise<unknown> => fakeResponse,
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

function setup<T>(hook: () => T) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(hook, { wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TCK-134 — admin finances KPI count queries', () => {
  it('usePendingPayoutsCount hits /api/payouts with status=pending and per_page=1, no agency_id', async () => {
    const spy = mockFetch({
      data: [],
      meta: { current_page: 1, last_page: 0, per_page: 1, total: 7 },
      links: { first: null, last: null, prev: null, next: null },
    });

    const { result } = setup(() => usePendingPayoutsCount());

    await waitFor(() => expect(result.current.data?.meta.total).toBe(7));

    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain('/api/payouts');
    expect(url).toContain('filter%5Bstatus%5D=pending');
    expect(url).toContain('per_page=1');
    expect(url).toContain('fields%5Bpayouts%5D=id');
    // Agency scope is server-side via active profile (TCK-141) — never sent from the client.
    expect(url).not.toContain('agency_id');
    // We only consume meta.total — no need for relations.
    expect(url).not.toContain('include=');
  });

  it('useDraftInvoicesCount hits /api/invoices with status=draft and per_page=1, no agency_id', async () => {
    const spy = mockFetch({
      data: [],
      meta: { current_page: 1, last_page: 0, per_page: 1, total: 3 },
      links: { first: null, last: null, prev: null, next: null },
    });

    const { result } = setup(() => useDraftInvoicesCount());

    await waitFor(() => expect(result.current.data?.meta.total).toBe(3));

    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain('/api/invoices');
    expect(url).toContain('filter%5Bstatus%5D=draft');
    expect(url).toContain('per_page=1');
    expect(url).toContain('fields%5Binvoices%5D=id');
    expect(url).not.toContain('agency_id');
  });
});
