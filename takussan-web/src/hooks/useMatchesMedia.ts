'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Subscribes to a CSS media-query via `useSyncExternalStore` so we don't
 * trigger cascading renders from a `setState` inside `useEffect`. The SSR
 * snapshot returns `false` (conservative "no match" assumption), which means
 * viewport-gated logic only flips on after hydration once we've actually
 * measured the client. Use this for any component that needs to mirror a
 * Tailwind responsive class (e.g. `md:hidden`) in JS — passing the same
 * pixel breakpoint Tailwind uses keeps both layers in lock-step.
 */
export function useMatchesMedia(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Convenience wrapper for `(max-width: ${px}px)`. */
export function useMatchesMaxWidth(maxWidthPx: number): boolean {
  return useMatchesMedia(`(max-width: ${maxWidthPx}px)`);
}
