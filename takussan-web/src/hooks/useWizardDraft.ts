'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WizardDraft, WizardDraftResponse } from '@/types/wizard-draft';

/**
 * TCK-250 — Frontend hook for resumable wizard drafts.
 *
 * - On mount, fetches the user's current draft for `key` (404 → null).
 * - Exposes `save(step, data)` that PUTs to `/api/me/wizard-drafts/{key}`,
 *   debounced to coalesce rapid keystrokes (default 800ms — see ticket).
 * - Exposes `clear()` that DELETEs the draft (called on completion or
 *   explicit user abandon).
 *
 * The hook does NOT prescribe the shape of `data` — each consumer wizard
 * brings its own schema and validates it.
 */
export type UseWizardDraftOptions = {
  /** Debounce window for autosave in ms. Default 800ms (per TCK-250 spec). */
  debounceMs?: number;
  /** Skip the initial GET (e.g. when the consumer already has the draft). */
  skipInitialFetch?: boolean;
};

export type UseWizardDraftResult<TData> = {
  /** True while the initial fetch is in flight. */
  isLoading: boolean;
  /** True while a save request is being sent. */
  isSaving: boolean;
  /** The most recent error from save/load, or null. */
  error: Error | null;
  /** The draft as last known by the server, or null if none yet. */
  draft: WizardDraft<TData> | null;
  /**
   * Schedule a save. Calls within `debounceMs` of each other coalesce into
   * a single PUT carrying the latest payload. Resolves when the actual
   * network request finishes (or immediately for the coalesced calls that
   * were superseded — they no-op and resolve undefined).
   */
  save: (step: number, data: TData) => void;
  /**
   * Force an immediate flush of any pending debounced save. Useful before
   * navigating away or unmounting. Resolves once the in-flight PUT settles.
   */
  flush: () => Promise<void>;
  /** Delete the draft on the server and reset local state. */
  clear: () => Promise<void>;
};

type FetchResponse<T> = { ok: boolean; status: number; json: () => Promise<T> };

async function safeFetch<T>(url: string, init?: RequestInit): Promise<FetchResponse<T>> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    ...init,
  });
  return {
    ok: res.ok,
    status: res.status,
    json: () => res.json() as Promise<T>,
  };
}

export function useWizardDraft<TData = Record<string, unknown>>(
  key: string,
  options: UseWizardDraftOptions = {},
): UseWizardDraftResult<TData> {
  const { debounceMs = 800, skipInitialFetch = false } = options;

  const [isLoading, setIsLoading] = useState(!skipInitialFetch);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [draft, setDraft] = useState<WizardDraft<TData> | null>(null);

  // Holds the most recent payload requested while a debounce timer is alive.
  const pendingRef = useRef<{ step: number; data: TData } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Promise resolver for the current debounce window — `flush()` awaits it.
  const flushResolversRef = useRef<Array<() => void>>([]);

  // Initial fetch — runs once per `key`.
  useEffect(() => {
    if (skipInitialFetch) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void (async () => {
      try {
        const res = await safeFetch<WizardDraftResponse<TData>>(
          `/api/me/wizard-drafts/${encodeURIComponent(key)}`,
          { method: 'GET' },
        );
        if (cancelled) return;
        if (res.status === 404) {
          setDraft(null);
        } else if (!res.ok) {
          throw new Error(`GET wizard-drafts failed (${res.status})`);
        } else {
          const body = await res.json();
          setDraft(body.data);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key, skipInitialFetch]);

  const performSave = useCallback(
    async (payload: { step: number; data: TData }): Promise<void> => {
      setIsSaving(true);
      setError(null);
      try {
        const res = await safeFetch<WizardDraftResponse<TData>>(
          `/api/me/wizard-drafts/${encodeURIComponent(key)}`,
          { method: 'PUT', body: JSON.stringify(payload) },
        );
        if (!res.ok) throw new Error(`PUT wizard-drafts failed (${res.status})`);
        const body = await res.json();
        setDraft(body.data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsSaving(false);
      }
    },
    [key],
  );

  const flush = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const payload = pendingRef.current;
    pendingRef.current = null;
    const resolvers = flushResolversRef.current;
    flushResolversRef.current = [];
    if (payload) {
      await performSave(payload);
    }
    resolvers.forEach((r) => r());
  }, [performSave]);

  const save = useCallback(
    (step: number, data: TData): void => {
      pendingRef.current = { step, data };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const payload = pendingRef.current;
        pendingRef.current = null;
        const resolvers = flushResolversRef.current;
        flushResolversRef.current = [];
        if (payload) {
          void performSave(payload).then(() => resolvers.forEach((r) => r()));
        } else {
          resolvers.forEach((r) => r());
        }
      }, debounceMs);
    },
    [debounceMs, performSave],
  );

  const clear = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = null;
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/me/wizard-drafts/${encodeURIComponent(key)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!res.ok && res.status !== 204) {
        throw new Error(`DELETE wizard-drafts failed (${res.status})`);
      }
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsSaving(false);
    }
  }, [key]);

  // Cleanup on unmount: cancel any pending debounce. We intentionally do NOT
  // auto-flush here — flushing should be an explicit consumer choice
  // (typically via `flush()` in a `beforeunload` handler).
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { isLoading, isSaving, error, draft, save, flush, clear };
}
