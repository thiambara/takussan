import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const apiFetchMock = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

import { useHomepageDiscovery } from '../useHomepageDiscovery';
import type { HomepageDiscoveryResponse } from '@/types/property';

const PAYLOAD: HomepageDiscoveryResponse = {
  data: {
    near: { items: [], city: 'Dakar', requested_city: null, fallback: false },
    rent: { items: [] },
    featured: { items: [] },
    latest: { items: [] },
  },
  meta: { per_row: 12 },
};

function url(): string {
  return apiFetchMock.mock.calls.at(-1)?.[0] as string;
}

describe('useHomepageDiscovery (TCK-247)', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(PAYLOAD);
  });

  it('calls the public discovery endpoint WITHOUT an /api prefix — apiFetch adds it', async () => {
    renderHook(() => useHomepageDiscovery());

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledOnce());
    expect(url().startsWith('/public/properties/discovery?')).toBe(true);
    expect(url()).not.toContain('/api/');
  });

  it('omits near_city entirely when the visitor city is unknown', async () => {
    renderHook(() => useHomepageDiscovery());

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledOnce());
    const params = new URLSearchParams(url().split('?')[1]);
    expect(params.has('near_city')).toBe(false);
    expect(params.get('per_row')).toBe('12');
  });

  it('sends the guessed city when there is one', async () => {
    renderHook(() => useHomepageDiscovery({ nearCity: 'Ziguinchor' }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledOnce());
    const params = new URLSearchParams(url().split('?')[1]);
    expect(params.get('near_city')).toBe('Ziguinchor');
  });

  it('issues ONE request for the four rows and exposes them together', async () => {
    const { result } = renderHook(() => useHomepageDiscovery({ nearCity: 'Dakar' }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(apiFetchMock).toHaveBeenCalledOnce();
    expect(Object.keys(result.current.rows ?? {})).toEqual([
      'near',
      'rent',
      'featured',
      'latest',
    ]);
  });

  it('holds the request until the caller is ready', async () => {
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useHomepageDiscovery({ enabled }),
      { initialProps: { enabled: false } },
    );

    expect(apiFetchMock).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledOnce());
  });

  it('reports failure as a flag, leaving the label to the component', async () => {
    apiFetchMock.mockRejectedValue(new Error('API error 500'));

    const { result } = renderHook(() => useHomepageDiscovery());

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.rows).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
