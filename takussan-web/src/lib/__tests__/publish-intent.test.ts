import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import {
  setPublishIntent,
  hasPublishIntent,
  clearPublishIntent,
  PUBLISH_INTENT_STORAGE_KEY,
} from '@/lib/publish-intent';

describe('publish-intent persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and reports a fresh intent', () => {
    setPublishIntent();
    expect(hasPublishIntent()).toBe(true);
    expect(window.localStorage.getItem(PUBLISH_INTENT_STORAGE_KEY)).not.toBeNull();
  });

  it('clears the intent on demand', () => {
    setPublishIntent();
    clearPublishIntent();
    expect(hasPublishIntent()).toBe(false);
    expect(window.localStorage.getItem(PUBLISH_INTENT_STORAGE_KEY)).toBeNull();
  });

  it('expires the intent after the TTL and self-cleans', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-10T10:00:00Z'));
    setPublishIntent();

    // Right after, fresh.
    expect(hasPublishIntent(60_000)).toBe(true);

    // Jump past the TTL — should report stale and remove the entry.
    vi.setSystemTime(new Date('2026-05-10T10:02:00Z'));
    expect(hasPublishIntent(60_000)).toBe(false);
    expect(window.localStorage.getItem(PUBLISH_INTENT_STORAGE_KEY)).toBeNull();
  });

  it('treats malformed payloads as no-intent and cleans up', () => {
    window.localStorage.setItem(PUBLISH_INTENT_STORAGE_KEY, 'not-json');
    expect(hasPublishIntent()).toBe(false);
    expect(window.localStorage.getItem(PUBLISH_INTENT_STORAGE_KEY)).toBeNull();
  });
});
