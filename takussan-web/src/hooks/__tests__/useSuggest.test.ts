import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useSuggest } from '../useSuggest';

vi.mock('@/lib/api', () => ({
  apiRequest: vi.fn(),
  buildQueryString: vi.fn(() => ''),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: null }),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'fr',
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

describe('useSuggest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is disabled when q is empty', () => {
    const { result } = renderHook(() => useSuggest(''), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('is enabled and fetches when q has content', async () => {
    const { apiRequest } = await import('@/lib/api');
    (apiRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { cities: [{ label: 'Dakar', count: 5 }], neighborhoods: [], property_types: [] },
    });

    const { result } = renderHook(() => useSuggest('da'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 500 });

    expect(apiRequest).toHaveBeenCalled();
  });
});
