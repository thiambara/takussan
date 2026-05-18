'use client';

import { useEffect, useState, type RefObject } from 'react';

type Options = {
  rootMargin?: string;
  threshold?: number | number[];
  /**
   * Optional scrollable ancestor. Defaults to the viewport. Pass a ref to an
   * overflowing container (e.g. the chat scroll area) so the sentinel is only
   * considered "visible" relative to that container's viewport.
   */
  root?: Element | null;
  enabled?: boolean;
};

/**
 * Reports whether the element referenced by `ref` is currently intersecting
 * its root. Used by the chat to trigger `fetchNextPage` when a top-of-list
 * sentinel scrolls into view.
 */
export function useIntersectionObserver(
  ref: RefObject<Element | null>,
  { rootMargin = '0px', threshold = 0, root = null, enabled = true }: Options = {},
): boolean {
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!enabled || !node || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsIntersecting(entry.isIntersecting),
      { root, rootMargin, threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, enabled, root, rootMargin, threshold]);

  return isIntersecting;
}
