'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import type { WelcomeSlide } from '@/components/welcome/WelcomeModal';
import type { WelcomeSeenListResponse } from '@/types/welcome-view';

/**
 * TCK-251 — Drives a one-shot welcome modale.
 *
 * Behaviour:
 * - Skips entirely if the user is anonymous (per spec — strictly
 *   user-scoped tracking).
 * - On mount, calls `GET /api/me/welcome-seen`. If `key` is missing
 *   from the returned list, opens the modale.
 * - On skip OR completion, POSTs `{ key }` to `/api/me/welcome-seen`
 *   (idempotent on the server) and closes locally. The POST is
 *   fire-and-forget for the UI: the modale closes immediately so the
 *   user is never blocked by a slow network.
 *
 * The returned shape is meant to spread directly into `<WelcomeModal>`.
 */
export type UseWelcomeOnceResult = {
  open: boolean;
  slides: WelcomeSlide[];
  onComplete: () => void;
  onSkip: () => void;
};

export function useWelcomeOnce(key: string, slides: WelcomeSlide[]): UseWelcomeOnceResult {
  const { user } = useAuth();
  const isAuthenticated = user !== null;

  const [open, setOpen] = useState(false);
  // Guard so we never POST twice for the same modale lifecycle (the
  // server is idempotent, but the network call is wasted).
  const acknowledgedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !key) return;
    let cancelled = false;
    acknowledgedRef.current = false;

    void (async () => {
      try {
        const res = await fetch('/api/me/welcome-seen', {
          method: 'GET',
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
        });
        if (cancelled) return;
        if (!res.ok) return; // 401 (anonymous race) or 5xx → never block UX
        const body = (await res.json()) as WelcomeSeenListResponse;
        const seen = Array.isArray(body?.data) ? body.data : [];
        if (!seen.includes(key)) setOpen(true);
      } catch {
        // Silent — never break the page because the welcome ping failed.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, key]);

  const acknowledge = useCallback(() => {
    if (acknowledgedRef.current || !key || !isAuthenticated) return;
    acknowledgedRef.current = true;
    void fetch('/api/me/welcome-seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ key }),
    }).catch(() => {
      // Silent — the server endpoint is idempotent, a missed write just
      // means the modale may resurface on the next session.
    });
  }, [isAuthenticated, key]);

  const onComplete = useCallback(() => {
    acknowledge();
    setOpen(false);
  }, [acknowledge]);

  const onSkip = useCallback(() => {
    acknowledge();
    setOpen(false);
  }, [acknowledge]);

  return { open, slides, onComplete, onSkip };
}
