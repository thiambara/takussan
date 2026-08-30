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

  // TCK-477 — l'encart de zone sûre déclaré par le consommateur lui est rendu tel
  // quel, pour qu'il n'ait pas à l'écrire deux fois. `undefined` pour un
  // `bottom-right`, qui ne touche pas le bord bas (cf. § DÉCISION dans `types.ts`).
  const paddingBottom = config.corner === 'bottom-full' ? config.safeAreaInset : undefined;

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

  return { bottom, paddingBottom };
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
    // Une barre pleine largeur colle au sol : `bottom: 0`. L'encart de zone sûre
    // n'est PAS un décalage de position — ce serait une bande transparente sous une
    // barre qui a un fond — mais un rembourrage intérieur, porté par le consommateur.
    //
    // Ce commentaire ne délègue plus RIEN : l'exigence est portée par le type
    // `FloatingDockSlotConfig` (un `bottom-full` ne se construit pas sans
    // `safeAreaInset`, et `tsc` en vérifie la forme), et le fait qu'elle atteigne le
    // DOM est vérifié par `__tests__/safe-area-contract.test.ts`. La décision et ses
    // trois motifs sont écrits dans `types.ts`, pas ici — TCK-477.
    //
    // ⚠ Jusqu'au 2026-08-29 ces lignes citaient `safe-area-bottom` comme la preuve
    // que les consommateurs honoraient la délégation. Cette classe n'a JAMAIS existé :
    // elle n'émettait aucune règle, et la barre n'avait aucun rembourrage sur iOS.
    // Trois endroits y croyaient, zéro l'implémentait ; trouvée par
    // `scripts/check-classes-emises.mjs` (TCK-453) le jour de sa mise en service.
    // *Un commentaire n'est pas une garde* — c'est exactement ce qui a échoué ici.
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
