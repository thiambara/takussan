import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useAgencyCurrency } from '../useAgencyCurrency';

/**
 * The hook delegates to `useApiQuery`, which in turn pulls in the auth
 * context and React Query. Stubbing it lets the test focus on the
 * normalisation + memoisation logic that lives in the hook itself.
 */
const useApiQueryMock = vi.fn();
vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (...args: unknown[]) => useApiQueryMock(...args),
}));

function setQueryReturn(value: { data?: { id: number; currency?: string } } | null, isLoading = false) {
  useApiQueryMock.mockReturnValue({
    data: value,
    isLoading,
    error: null,
  });
}

// Normalise NBSP (U+00A0) and NNBSP (U+202F) — Node 22+ uses NNBSP for
// `fr-*` grouping while older runtimes still emit NBSP.
function normalize(value: string): string {
  return value.replace(/[   ]/gu, ' ');
}

describe('useAgencyCurrency', () => {
  beforeEach(() => {
    useApiQueryMock.mockReset();
  });

  it('returns XOF defaults while the agency id is missing', () => {
    setQueryReturn(null);
    const { result } = renderHook(() => useAgencyCurrency(null));

    expect(result.current.currency).toBe('XOF');
    expect(result.current.symbol).toBe('F CFA');
    expect(normalize(result.current.formatter(1234))).toBe('1 234 F CFA');
    expect(result.current.isLoading).toBe(false);

    // The hook still calls useApiQuery (TanStack expects it) but it is
    // disabled — the second argument carries the path with id `0`.
    const callArgs = useApiQueryMock.mock.calls[0];
    expect((callArgs[2] as { enabled: boolean }).enabled).toBe(false);
  });

  it('returns the resolved currency once the API responds', () => {
    setQueryReturn({ data: { id: 12, currency: 'EUR' } });
    const { result } = renderHook(() => useAgencyCurrency(12));

    expect(result.current.currency).toBe('EUR');
    expect(result.current.symbol).toBe('€');
    expect(normalize(result.current.formatter(150_000))).toBe('150 000,00 €');
  });

  it('falls back to XOF when the API returns an unknown code', () => {
    setQueryReturn({ data: { id: 1, currency: 'JPY' } });
    const { result } = renderHook(() => useAgencyCurrency(1));

    expect(result.current.currency).toBe('XOF');
    expect(result.current.symbol).toBe('F CFA');
  });

  it('memoises the formatter so identical renders share a reference', () => {
    setQueryReturn({ data: { id: 1, currency: 'USD' } });
    const { result, rerender } = renderHook(() => useAgencyCurrency(1));
    const first = result.current.formatter;

    rerender();
    expect(result.current.formatter).toBe(first);
  });

  it('passes sparse fieldsets so the network call stays cheap', () => {
    setQueryReturn({ data: { id: 5, currency: 'XOF' } });
    renderHook(() => useAgencyCurrency(5));

    const params = (useApiQueryMock.mock.calls[0][2] as {
      params?: { fields?: { agencies?: string } };
    }).params;
    expect(params?.fields?.agencies).toBe('id,currency');
  });
});
