'use client';

import { useEffect, useState, type RefObject } from 'react';

type Options = {
  rootMargin?: string;
  threshold?: number | number[];
  /**
   * Ancêtre scrollable optionnel. Par défaut le viewport.
   *
   * ⚠️ TCK-316 — on prend une **ref**, pas un `Element`. L'appelant écrivait
   * `root: scrollRef.current`, c'est-à-dire une lecture de ref PENDANT LE
   * RENDU : `null` au premier rendu, et aucun re-rendu quand la ref se remplit.
   * L'observateur se construisait donc contre le viewport au lieu du conteneur,
   * en silence. La ref est déréférencée ici, dans l'effet, où c'est licite.
   */
  root?: RefObject<Element | null> | null;
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
      { root: root?.current ?? null, rootMargin, threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, enabled, root, rootMargin, threshold]);

  return isIntersecting;
}
