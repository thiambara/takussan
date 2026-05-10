'use client';

import { createContext, useContext } from 'react';

/**
 * TCK-253 — App-wide trigger for the deferred minimal-profile sheet.
 *
 * The sheet is rendered once at the dashboard shell level (see
 * `<MinimalProfileTriggerProvider>`). Any consumer hook that performs a
 * "sensitive" action (favoriting, booking, contacting an agent) calls
 * `triggerIfNeeded()` after firing its own mutation — the sensitive
 * action is never blocked.
 *
 * If the provider is absent (e.g. on public pages, or for non-customer
 * roles), `triggerIfNeeded()` is a safe no-op.
 */

export type MinimalProfileTriggerContextValue = {
  /**
   * Open the sheet if the `customer-profile-minimal` welcome key has not
   * been seen yet. Idempotent — can be called many times safely; the
   * decision is made against a single in-memory cache loaded from
   * `/api/me/welcome-seen`.
   */
  triggerIfNeeded: () => void;
};

const MinimalProfileTriggerContext = createContext<MinimalProfileTriggerContextValue | null>(null);

export function useTriggerMinimalProfileOnce(): MinimalProfileTriggerContextValue {
  const ctx = useContext(MinimalProfileTriggerContext);
  // Default to a no-op so the call site never has to guard against the
  // provider being absent — sensitive-action hooks are reused on public
  // pages where the provider isn't mounted.
  return ctx ?? { triggerIfNeeded: () => {} };
}

export { MinimalProfileTriggerContext };
