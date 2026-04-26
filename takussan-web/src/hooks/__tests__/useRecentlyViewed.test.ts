import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import {
  recentlyViewedStorage,
  RECENTLY_VIEWED_MAX,
  RECENTLY_VIEWED_TTL_MS,
  RECENTLY_VIEWED_KEY,
} from '@/lib/recently-viewed';

// ── Mock apiFetch ─────────────────────────────────────────────────────────────

const apiFetchMock = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

import { useRecentlyViewed } from '../useRecentlyViewed';

// ── Shared property fixture ───────────────────────────────────────────────────

function makeProperty(id: number) {
  return {
    id,
    slug: `prop-${id}`,
    title: `Property ${id}`,
    price: 1000,
    currency: 'XOF',
    type: 'house' as const,
    contract_type: 'sale' as const,
    rent_period: null,
    bedrooms: null,
    bathrooms: null,
    area: null,
    furnished: false,
    featured: false,
    main_photo_url: null,
    published_at: null,
    created_at: '2024-01-01',
    location: {
      quarter: null,
      city: 'Dakar',
      region: null,
      country: null,
      latitude: null,
      longitude: null,
    },
    reference_number: '',
    status: null,
    visibility: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage layer — FIFO, dedupe, TTL, excludeId, clear
// ─────────────────────────────────────────────────────────────────────────────

describe('recentlyViewedStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('stores entries ordered most-recent-first', () => {
    recentlyViewedStorage.push(1);
    recentlyViewedStorage.push(2);
    recentlyViewedStorage.push(3);
    expect(recentlyViewedStorage.read().map((e) => e.id)).toEqual([3, 2, 1]);
  });

  it('deduplicates: re-pushing an existing id moves it to head without creating a duplicate (AC2)', () => {
    recentlyViewedStorage.push(1);
    recentlyViewedStorage.push(2);
    recentlyViewedStorage.push(1);
    const entries = recentlyViewedStorage.read();
    expect(entries.map((e) => e.id)).toEqual([1, 2]);
    expect(entries).toHaveLength(2);
  });

  it(`caps at ${RECENTLY_VIEWED_MAX} entries and evicts the oldest (FIFO) (AC3)`, () => {
    for (let i = 1; i <= RECENTLY_VIEWED_MAX + 1; i++) {
      recentlyViewedStorage.push(i);
    }
    const entries = recentlyViewedStorage.read();
    expect(entries).toHaveLength(RECENTLY_VIEWED_MAX);
    expect(entries.find((e) => e.id === 1)).toBeUndefined(); // oldest evicted
    expect(entries[0].id).toBe(RECENTLY_VIEWED_MAX + 1); // newest at head
  });

  it('purges entries older than 30 days on purgeExpired() (AC4)', () => {
    const old = new Date(Date.now() - RECENTLY_VIEWED_TTL_MS - 1000).toISOString();
    const fresh = new Date().toISOString();
    localStorage.setItem(
      RECENTLY_VIEWED_KEY,
      JSON.stringify([
        { id: 99, viewed_at: old },
        { id: 1, viewed_at: fresh },
      ]),
    );
    recentlyViewedStorage.purgeExpired();
    const entries = recentlyViewedStorage.read();
    expect(entries.map((e) => e.id)).toEqual([1]);
    expect(entries.find((e) => e.id === 99)).toBeUndefined();
  });

  it('read(excludeId) omits the specified id (AC5)', () => {
    recentlyViewedStorage.push(1);
    recentlyViewedStorage.push(2);
    recentlyViewedStorage.push(3);
    expect(recentlyViewedStorage.read(2).map((e) => e.id)).toEqual([3, 1]);
  });

  it('clear() removes all entries (AC7)', () => {
    recentlyViewedStorage.push(1);
    recentlyViewedStorage.push(2);
    recentlyViewedStorage.clear();
    expect(recentlyViewedStorage.read()).toEqual([]);
  });

  it('purgeIds() removes the listed ids silently', () => {
    recentlyViewedStorage.push(1);
    recentlyViewedStorage.push(2);
    recentlyViewedStorage.push(3);
    recentlyViewedStorage.purgeIds([2]);
    expect(recentlyViewedStorage.read().map((e) => e.id)).toEqual([3, 1]);
  });

  it('records a valid ISO viewed_at timestamp on push', () => {
    recentlyViewedStorage.push(42);
    const [entry] = recentlyViewedStorage.read();
    expect(() => new Date(entry.viewed_at)).not.toThrow();
    expect(new Date(entry.viewed_at).getTime()).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useRecentlyViewed hook — hydration-safe + API integration
// ─────────────────────────────────────────────────────────────────────────────

describe('useRecentlyViewed', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('returns empty items and loading=false before the mount effect fires (AC8 — hydration-safe)', () => {
    recentlyViewedStorage.push(1);
    recentlyViewedStorage.push(2);

    // Prevent the effect from resolving during this synchronous check.
    apiFetchMock.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useRecentlyViewed());
    // Synchronous render phase — must match SSR output (empty).
    expect(result.current.items).toEqual([]);
  });

  it('fetches from API after mount and restores most-recent-first order', async () => {
    recentlyViewedStorage.push(1);
    recentlyViewedStorage.push(2);
    recentlyViewedStorage.push(3); // most recent

    apiFetchMock.mockResolvedValue({
      data: [makeProperty(1), makeProperty(2), makeProperty(3)],
    });

    const { result } = renderHook(() => useRecentlyViewed());

    await act(async () => {
      await Promise.resolve();
    });

    // Order follows storage: [3, 2, 1]
    expect(result.current.items.map((p) => p.id)).toEqual([3, 2, 1]);
    expect(result.current.loading).toBe(false);
  });

  it('silently purges ghost ids (properties not returned by API)', async () => {
    recentlyViewedStorage.push(1);
    recentlyViewedStorage.push(2); // ghost — API will not return this
    recentlyViewedStorage.push(3);

    apiFetchMock.mockResolvedValue({
      data: [makeProperty(1), makeProperty(3)],
    });

    const { result } = renderHook(() => useRecentlyViewed());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.items.map((p) => p.id)).toEqual([3, 1]);
    // id=2 must be purged from localStorage
    expect(recentlyViewedStorage.read().find((e) => e.id === 2)).toBeUndefined();
  });

  it('excludeId is passed through to read() so the current property is absent (AC5)', async () => {
    recentlyViewedStorage.push(1);
    recentlyViewedStorage.push(2);

    apiFetchMock.mockResolvedValue({ data: [makeProperty(1)] });

    const { result } = renderHook(() => useRecentlyViewed(2));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.items.map((p) => p.id)).toEqual([1]);
    // id=2 still in storage (not purged — it was excluded, not a ghost)
    expect(recentlyViewedStorage.read().find((e) => e.id === 2)).toBeDefined();
  });

  it('clear() empties items state and localStorage (AC7)', async () => {
    recentlyViewedStorage.push(1);
    recentlyViewedStorage.push(2);
    apiFetchMock.mockResolvedValue({ data: [makeProperty(1), makeProperty(2)] });

    const { result } = renderHook(() => useRecentlyViewed());

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.clear();
    });

    expect(result.current.items).toEqual([]);
    expect(recentlyViewedStorage.read()).toEqual([]);
  });

  it('returns empty items when the API call fails', async () => {
    recentlyViewedStorage.push(1);
    apiFetchMock.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useRecentlyViewed());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('calls the dedicated /public/properties/by-ids endpoint with a csv ids param', async () => {
    recentlyViewedStorage.push(1);
    recentlyViewedStorage.push(2);
    recentlyViewedStorage.push(3);
    apiFetchMock.mockResolvedValue({ data: [] });

    renderHook(() => useRecentlyViewed());

    await act(async () => {
      await Promise.resolve();
    });

    expect(apiFetchMock).toHaveBeenCalledOnce();
    const url = apiFetchMock.mock.calls[0]![0] as string;
    expect(url.startsWith('/public/properties/by-ids?')).toBe(true);
    expect(url).toMatch(/[?&]ids=3%2C2%2C1(?:&|$)/);
  });
});
