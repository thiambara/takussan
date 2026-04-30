import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, renderHook } from '@testing-library/react';
import React from 'react';

import { CompareProvider, useCompare } from '../CompareContext';
import { COMPARE_STORAGE_KEY } from '@/lib/compare';

function wrap({ children }: { children: React.ReactNode }) {
  return <CompareProvider>{children}</CompareProvider>;
}

describe('CompareContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts empty and hydrates on mount', async () => {
    const { result } = renderHook(() => useCompare(), { wrapper: wrap });
    // After initial render + useEffect flush
    expect(result.current.ids).toEqual([]);
    expect(result.current.isHydrated).toBe(true);
  });

  it('hydrates from localStorage on mount', () => {
    localStorage.setItem(
      COMPARE_STORAGE_KEY,
      JSON.stringify({ ids: [7, 8], updated_at: Date.now() }),
    );
    const { result } = renderHook(() => useCompare(), { wrapper: wrap });
    expect(result.current.ids).toEqual([7, 8]);
  });

  it('adds ids up to the cap and rejects the 5th', () => {
    const { result } = renderHook(() => useCompare(), { wrapper: wrap });

    act(() => {
      result.current.add(1);
    });
    act(() => {
      result.current.add(2);
    });
    act(() => {
      result.current.add(3);
    });
    act(() => {
      result.current.add(4);
    });
    expect(result.current.ids).toEqual([1, 2, 3, 4]);
    expect(result.current.isFull).toBe(true);

    let outcome: ReturnType<typeof result.current.add> | undefined;
    act(() => {
      outcome = result.current.add(5);
    });
    expect(outcome?.status).toBe('rejected');
    expect(result.current.ids).toEqual([1, 2, 3, 4]);
  });

  it('persists writes to localStorage', () => {
    const { result } = renderHook(() => useCompare(), { wrapper: wrap });
    act(() => {
      result.current.add(11);
    });
    act(() => {
      result.current.add(22);
    });
    const stored = JSON.parse(localStorage.getItem(COMPARE_STORAGE_KEY) ?? '{}');
    expect(stored.ids).toEqual([11, 22]);
  });

  it('toggle flips add/remove on the same id', () => {
    const { result } = renderHook(() => useCompare(), { wrapper: wrap });
    act(() => {
      expect(result.current.toggle(10).status).toBe('added');
    });
    expect(result.current.has(10)).toBe(true);
    act(() => {
      expect(result.current.toggle(10).status).toBe('removed');
    });
    expect(result.current.has(10)).toBe(false);
  });

  it('remove no-ops when id is not selected', () => {
    const { result } = renderHook(() => useCompare(), { wrapper: wrap });
    act(() => {
      result.current.add(1);
    });
    act(() => {
      result.current.remove(99);
    });
    expect(result.current.ids).toEqual([1]);
  });

  it('replace overrides the entire selection', () => {
    const { result } = renderHook(() => useCompare(), { wrapper: wrap });
    act(() => {
      result.current.replace([1, 2]);
    });
    act(() => {
      result.current.replace([8, 9]);
    });
    expect(result.current.ids).toEqual([8, 9]);
  });

  it('clear empties the store and storage', () => {
    const { result } = renderHook(() => useCompare(), { wrapper: wrap });
    act(() => {
      result.current.replace([1, 2]);
    });
    act(() => {
      result.current.clear();
    });
    expect(result.current.ids).toEqual([]);
    const stored = JSON.parse(localStorage.getItem(COMPARE_STORAGE_KEY) ?? '{}');
    expect(stored.ids).toEqual([]);
  });

  it('returns fallback no-op values when used outside a provider', () => {
    const { result } = renderHook(() => useCompare()); // no wrapper
    expect(result.current.ids).toEqual([]);
    expect(result.current.isHydrated).toBe(false);
    expect(result.current.add(1).status).toBe('noop');
  });

  it('supports multiple consumers sharing state', () => {
    function Inner() {
      const { ids, add } = useCompare();
      return (
        <div>
          <span data-testid="ids">{ids.join(',')}</span>
          <button onClick={() => add(5)}>add</button>
        </div>
      );
    }
    const { getByTestId, getByText } = render(
      <CompareProvider>
        <Inner />
      </CompareProvider>,
    );
    expect(getByTestId('ids').textContent).toBe('');
    act(() => {
      getByText('add').click();
    });
    expect(getByTestId('ids').textContent).toBe('5');
  });
});
