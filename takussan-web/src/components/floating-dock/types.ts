/**
 * TCK-275 — Floating Dock orchestrator types.
 */

/**
 * Where on the bottom edge an element anchors.
 *
 * - `bottom-right` — pinned to the bottom-right corner. Multiple slots stack
 *   vertically by ascending priority (lowest priority = closest to the floor).
 * - `bottom-full` — full-width sticky bar that touches the floor (e.g. the
 *   `PropertyMobileBottomBar`). Its presence shifts every `bottom-right`
 *   slot above its height so they never get hidden behind it.
 */
export type DockCorner = 'bottom-right' | 'bottom-full';

/** Public configuration accepted by the `useFloatingDockSlot` hook. */
export type FloatingDockSlotConfig = {
  /** Stable identity. Used as the registry key — must be unique across slots. */
  id: string;
  /** Anchor position. */
  corner: DockCorner;
  /**
   * Numeric priority for `bottom-right` slots. Lowest priority sits on the
   * floor, higher priorities stack on top. Defaults to `0`.
   */
  priority?: number;
  /**
   * Logical height of the slot in pixels. Used to push neighbouring slots
   * away. This is intentionally a static value (set by the consumer) rather
   * than a measured one — keeps positioning deterministic, side-steps any
   * FOUC during hydration, and avoids tight coupling to a `ResizeObserver`.
   */
  height: number;
  /**
   * Whether the slot is currently visible. When `false` the slot is treated
   * as if it never registered (no contribution to neighbour offsets).
   * Defaults to `true`.
   */
  enabled?: boolean;
};

/** Internal record stored in the dock's registry. */
export type FloatingDockSlot = {
  id: string;
  corner: DockCorner;
  priority: number;
  height: number;
};

/** Return value of the `useFloatingDockSlot` hook. */
export type FloatingDockSlotResult = {
  /**
   * Pre-formatted CSS `bottom` value that the consumer applies on its fixed
   * wrapper. Includes the responsive base offset via the
   * `--floating-dock-base` CSS variable (16px on small screens, 24px on
   * `sm:`+).
   */
  bottom: string;
};
