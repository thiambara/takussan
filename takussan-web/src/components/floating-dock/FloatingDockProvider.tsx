'use client';

import React, { createContext, useCallback, useMemo, useState } from 'react';

import type { FloatingDockSlot } from './types';

/**
 * TCK-275 — Floating Dock orchestrator.
 *
 * Maintains a registry of every floating UI element pinned to the bottom edge
 * of the viewport. Children call `useFloatingDockSlot(...)` to register and
 * read back the `bottom` CSS value they should apply on their fixed wrapper.
 *
 * Rendering is left to the consumer — the dock owns *positioning logic*, not
 * markup. This keeps existing components (CompareFloatingBar, ChatWidget,
 * PropertyMobileBottomBar) in charge of their own DOM, animations and
 * `data-testid`s, and lets the dock stay a thin coordination layer.
 *
 * The store is split in two contexts on purpose:
 *
 *   - `FloatingDockMutationsContext` exposes `register` / `unregister` and
 *     never changes identity. Consumers depend on it inside their
 *     registration effect so they don't loop on every slot mutation.
 *   - `FloatingDockSlotsContext` carries the live registry. Consumers read
 *     it during render to compute their `bottom` offset.
 */

export type FloatingDockRegistry = ReadonlyMap<string, FloatingDockSlot>;

export type FloatingDockMutations = {
  register: (slot: FloatingDockSlot) => void;
  unregister: (id: string) => void;
};

export const FloatingDockMutationsContext =
  createContext<FloatingDockMutations | null>(null);

export const FloatingDockSlotsContext =
  createContext<FloatingDockRegistry | null>(null);

const EMPTY: FloatingDockRegistry = new Map();

export function FloatingDockProvider({ children }: { children: React.ReactNode }) {
  const [slots, setSlots] = useState<FloatingDockRegistry>(EMPTY);

  const register = useCallback((slot: FloatingDockSlot) => {
    setSlots((prev) => {
      const previous = prev.get(slot.id);
      if (
        previous &&
        previous.corner === slot.corner &&
        previous.priority === slot.priority &&
        previous.height === slot.height
      ) {
        // Identical re-registration → keep the same Map reference so we don't
        // trigger a re-render storm when a parent re-renders and our consumer
        // re-runs the registration effect with stable inputs.
        return prev;
      }
      const next = new Map(prev);
      next.set(slot.id, slot);
      return next;
    });
  }, []);

  const unregister = useCallback((id: string) => {
    setSlots((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const mutations = useMemo<FloatingDockMutations>(
    () => ({ register, unregister }),
    [register, unregister],
  );

  return (
    <FloatingDockMutationsContext.Provider value={mutations}>
      <FloatingDockSlotsContext.Provider value={slots}>{children}</FloatingDockSlotsContext.Provider>
    </FloatingDockMutationsContext.Provider>
  );
}
