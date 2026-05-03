import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { OverduePaymentsTable } from '../OverduePaymentsTable';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'fr',
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
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

function renderTable() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OverduePaymentsTable />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TCK-134 — OverduePaymentsTable', () => {
  it('hard-pins filter[status]=late on the payments-history endpoint', async () => {
    const spy = mockFetch({
      data: [],
      meta: {
        current_page: 1,
        last_page: 0,
        per_page: 20,
        total: 0,
      },
    });
    renderTable();

    await waitFor(() => expect(spy).toHaveBeenCalled());
    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain('/api/payments/history');
    expect(url).toContain('filter%5Bstatus%5D=late');
    expect(url).toContain('per_page=20');
    expect(url).toContain('sort=-date');
    expect(url).not.toContain('agency_id');
  });

  it('renders the empty state when no overdue payments are returned', async () => {
    mockFetch({
      data: [],
      meta: { current_page: 1, last_page: 0, per_page: 20, total: 0 },
    });
    renderTable();
    await waitFor(() => {
      expect(screen.getByTestId('overdue-payments-empty')).toBeInTheDocument();
    });
  });

  it('renders the late row when the API returns a payment in retard', async () => {
    mockFetch({
      data: [
        {
          source: 'lease',
          id: 42,
          reference_number: 'REF-42',
          amount: 150_000,
          currency: 'XOF',
          payment_method: 'bank_transfer',
          payment_type: 'rent',
          status: 'late',
          paid_amount: 0,
          remaining_amount: 150_000,
          date: '2026-04-01T00:00:00Z',
          paid_at: null,
          period_start: '2026-04-01',
          period_end: '2026-04-30',
          due_date: '2026-04-05',
          booking_id: null,
          lease_id: 7,
          property_id: 11,
          customer_id: 3,
          created_at: '2026-04-01T00:00:00Z',
        },
      ],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
    });
    renderTable();
    await waitFor(() => {
      expect(screen.getByTestId('overdue-payments-table')).toBeInTheDocument();
    });
    expect(screen.getByText('REF-42')).toBeInTheDocument();
    expect(screen.getByText(/Bail #7/)).toBeInTheDocument();
  });
});
