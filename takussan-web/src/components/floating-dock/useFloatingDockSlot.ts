'use client';

import { useContext, useEffect, useMemo } from 'react';

import {
  FloatingDockMutationsContext,
  FloatingDockSlotsContext,
  type FloatingDockRegistry,
} from './FloatingDockProvider';
import type { FloatingDockSlot, FloatingDockSlotConfig, FloatingDockSlotResult } from './types';

/** Spacing applied between two stacked slots, in physical millimetres. */
const GAP_MM = 3;

/** CSS expression resolving to the responsive base offset declared in `globals.css`. */
const BASE_OFFSET = 'var(--floating-dock-base, 16px)';

/**
 * TCK-275 — Hook used by every floating UI element to claim a slot in the
 * shared bottom dock and read back the `bottom` value it should apply.
 *
 * Behaviour outside of `FloatingDockProvider` is intentionally graceful: the
 * hook stays a no-op and returns the standalone fallback offset. This keeps
 * unit tests of consumer components (rendered in isolation) from having to
 * mount the provider just to assert markup, and means the migration of the
 * three existing components remains backwards-compatible with their tests.
 */
export function useFloatingDockSlot(config: FloatingDockSlotConfig): FloatingDockSlotResult {
  const mutations = useContext(FloatingDockMutationsContext);
  const slots = useContext(FloatingDockSlotsContext);

  const { id, corner, height, enabled = true } = config;
  const priority = config.priority ?? 0;
  const isActive = enabled !== false;

  // Register / unregister effect. `mutations` is intentionally stable across
  // re-renders (split context, see `FloatingDockProvider`), so this effect
  // runs only when the slot's identity / shape really changes.
  useEffect(() => {
    if (!mutations) return;
    if (!isActive) {
      mutations.unregister(id);
      return;
    }
    mutations.register({ id, corner, priority, height });
    return () => mutations.unregister(id);
  }, [mutations, id, corner, priority, height, isActive]);

  // Compute the bottom offset on every registry change.
  const bottom = useMemo(() => {
    if (!slots || !isActive) {
      return corner === 'bottom-full' ? '0px' : BASE_OFFSET;
    }
    return computeBottom(slots, { id, corner, priority, height });
  }, [slots, isActive, id, corner, priority, height]);

  return { bottom };
}

/**
 * Pure positioning logic. Exported for unit-testing the algorithm in isolation
 * without spinning up a provider.
 */
export function computeBottom(
  registry: FloatingDockRegistry,
  self: FloatingDockSlot,
): string {
  if (self.corner === 'bottom-full') {
    // Full-width sticky bars hug the floor (the safe-area inset is the
    // consumer's responsibility — see `safe-area-bottom` on the existing
    // `PropertyMobileBottomBar`).
    return '0px';
  }

  let heightPx = 0;
  let gapCount = 0;

  // Every full-width bar pushes the entire bottom-right column upward by its
  // own height plus a gap, so floating actions never end up hidden behind it.
  for (const slot of registry.values()) {
    if (slot.corner === 'bottom-full') {
      heightPx += slot.height;
      gapCount += 1;
    }
  }

  // Bottom-right slots stack by ascending priority. We sit above every slot
  // with strictly lower priority. Ties keep the registration order stable
  // because Map iteration is insertion-order in ES2015+.
  for (const slot of registry.values()) {
    if (slot.id === self.id) continue;
    if (slot.corner !== 'bottom-right') continue;
    if (slot.priority < self.priority) {
      heightPx += slot.height;
      gapCount += 1;
    }
  }

  if (heightPx === 0 && gapCount === 0) {
    return BASE_OFFSET;
  }

  return `calc(${BASE_OFFSET} + ${heightPx}px + ${gapCount * GAP_MM}mm)`;
}
