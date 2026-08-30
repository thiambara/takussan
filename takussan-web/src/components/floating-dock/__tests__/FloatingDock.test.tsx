/**
 * TCK-275 — Floating Dock orchestrator.
 *
 * The dock decides where each registered floating UI element should sit on the
 * vertical axis so they never overlap. Tests exercise the public contract :
 *   - the hook returns a sane default outside the provider (graceful fallback)
 *   - inside the provider, slots stack vertically by priority
 *   - a `bottom-full` slot pushes every `bottom-right` slot above its height
 *   - unmounting a slot recompacts the dock (no phantom gap)
 *   - any third-party component can register without touching siblings (AC6)
 */
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import React from 'react';

import { FloatingDockProvider } from '../FloatingDockProvider';
import { useFloatingDockSlot } from '../useFloatingDockSlot';
import type { FloatingDockSlotConfig } from '../types';

const BASE = 'var(--floating-dock-base, 16px)';

/** Encart de zone sûre de la sonde — cf. `describe('… la zone sûre …')` plus bas. */
const PROBE_INSET = 'calc(1rem + env(safe-area-inset-bottom))';

function Probe({
  id,
  corner,
  priority,
  height,
  enabled = true,
}: {
  id: string;
  corner: 'bottom-right' | 'bottom-full';
  priority?: number;
  height: number;
  enabled?: boolean;
}) {
  // TCK-477 — la configuration est une union discriminée : un `bottom-full` ne se
  // construit pas sans `safeAreaInset`. La sonde branche donc explicitement, au lieu
  // de passer un `corner` de type union (que `tsc` refuserait, à raison).
  const config: FloatingDockSlotConfig =
    corner === 'bottom-full'
      ? { id, priority, height, enabled, corner, safeAreaInset: PROBE_INSET }
      : { id, priority, height, enabled, corner };
  const { bottom, paddingBottom } = useFloatingDockSlot(config);
  return (
    <div data-testid={`probe-${id}`} data-bottom={bottom} data-padding={paddingBottom ?? ''}>
      {id}
    </div>
  );
}

describe('useFloatingDockSlot — graceful fallback (no provider)', () => {
  it('returns the base bottom value when used outside a FloatingDockProvider', () => {
    render(<Probe id="orphan" corner="bottom-right" height={56} />);
    expect(screen.getByTestId('probe-orphan').dataset.bottom).toBe(BASE);
  });

  it('returns 0px for a bottom-full slot when used outside a provider', () => {
    render(<Probe id="orphan-full" corner="bottom-full" height={70} />);
    expect(screen.getByTestId('probe-orphan-full').dataset.bottom).toBe('0px');
  });
});

describe('useFloatingDockSlot — stacking inside provider', () => {
  it('a single bottom-right slot sits at the base offset', () => {
    render(
      <FloatingDockProvider>
        <Probe id="solo" corner="bottom-right" priority={0} height={56} />
      </FloatingDockProvider>,
    );
    expect(screen.getByTestId('probe-solo').dataset.bottom).toBe(BASE);
  });

  it('stacks bottom-right slots by ascending priority (lower priority = floor)', () => {
    render(
      <FloatingDockProvider>
        <Probe id="chat" corner="bottom-right" priority={0} height={56} />
        <Probe id="compare" corner="bottom-right" priority={1} height={64} />
      </FloatingDockProvider>,
    );

    // chat is the floor anchor
    expect(screen.getByTestId('probe-chat').dataset.bottom).toBe(BASE);
    // compare sits above chat: base + 56px (chat height) + 3mm (gap)
    expect(screen.getByTestId('probe-compare').dataset.bottom).toBe(
      `calc(var(--floating-dock-base, 16px) + 56px + 3mm)`,
    );
  });

  it('stacks 3+ slots correctly', () => {
    render(
      <FloatingDockProvider>
        <Probe id="a" corner="bottom-right" priority={0} height={50} />
        <Probe id="b" corner="bottom-right" priority={1} height={40} />
        <Probe id="c" corner="bottom-right" priority={2} height={30} />
      </FloatingDockProvider>,
    );
    expect(screen.getByTestId('probe-a').dataset.bottom).toBe(BASE);
    // b above a: base + 50px + 3mm
    expect(screen.getByTestId('probe-b').dataset.bottom).toBe(
      `calc(var(--floating-dock-base, 16px) + 50px + 3mm)`,
    );
    // c above b: base + (50 + 40)px + (3 + 3)mm
    expect(screen.getByTestId('probe-c').dataset.bottom).toBe(
      `calc(var(--floating-dock-base, 16px) + 90px + 6mm)`,
    );
  });
});

describe('useFloatingDockSlot — bottom-full pushes the stack up', () => {
  it('a bottom-full slot is itself anchored at 0px (touches the floor)', () => {
    render(
      <FloatingDockProvider>
        <Probe id="bar" corner="bottom-full" height={70} />
      </FloatingDockProvider>,
    );
    expect(screen.getByTestId('probe-bar').dataset.bottom).toBe('0px');
  });

  it('lifts every bottom-right slot above its height + gap', () => {
    render(
      <FloatingDockProvider>
        <Probe id="bar" corner="bottom-full" height={70} />
        <Probe id="chat" corner="bottom-right" priority={0} height={56} />
        <Probe id="compare" corner="bottom-right" priority={1} height={64} />
      </FloatingDockProvider>,
    );
    // chat is now base + 70px (full bar) + 3mm (gap)
    expect(screen.getByTestId('probe-chat').dataset.bottom).toBe(
      `calc(var(--floating-dock-base, 16px) + 70px + 3mm)`,
    );
    // compare = base + (70 + 56)px + (3 + 3)mm
    expect(screen.getByTestId('probe-compare').dataset.bottom).toBe(
      `calc(var(--floating-dock-base, 16px) + 126px + 6mm)`,
    );
  });
});

describe('useFloatingDockSlot — dynamic mount / unmount', () => {
  it('recompacts the dock when a slot below us unmounts (no phantom gap)', () => {
    function Toggle({ on }: { on: boolean }) {
      return (
        <FloatingDockProvider>
          {on && <Probe id="chat" corner="bottom-right" priority={0} height={56} />}
          <Probe id="compare" corner="bottom-right" priority={1} height={64} />
        </FloatingDockProvider>
      );
    }
    const { rerender } = render(<Toggle on={true} />);
    expect(screen.getByTestId('probe-compare').dataset.bottom).toBe(
      `calc(var(--floating-dock-base, 16px) + 56px + 3mm)`,
    );

    act(() => {
      rerender(<Toggle on={false} />);
    });

    // chat unmounted → compare drops to the base
    expect(screen.getByTestId('probe-compare').dataset.bottom).toBe(BASE);
  });

  it('a slot disabled via `enabled: false` is treated as absent', () => {
    function Conditional({ enabled }: { enabled: boolean }) {
      return (
        <FloatingDockProvider>
          <Probe
            id="chat"
            corner="bottom-right"
            priority={0}
            height={56}
            enabled={enabled}
          />
          <Probe id="compare" corner="bottom-right" priority={1} height={64} />
        </FloatingDockProvider>
      );
    }
    const { rerender } = render(<Conditional enabled={true} />);
    expect(screen.getByTestId('probe-compare').dataset.bottom).toBe(
      `calc(var(--floating-dock-base, 16px) + 56px + 3mm)`,
    );

    act(() => {
      rerender(<Conditional enabled={false} />);
    });

    expect(screen.getByTestId('probe-compare').dataset.bottom).toBe(BASE);
  });

  it('a disabled bottom-full slot stops lifting the bottom-right column (AC3 — no phantom offset)', () => {
    // Mirrors PropertyMobileBottomBar's behaviour on desktop: the bar exists in
    // the tree but `enabled` is false (viewport >= lg), so the chat widget must
    // sit at the base offset, not above an invisible 70px bar.
    function Page({ mobile }: { mobile: boolean }) {
      return (
        <FloatingDockProvider>
          <Probe id="bar" corner="bottom-full" height={70} enabled={mobile} />
          <Probe id="chat" corner="bottom-right" priority={0} height={56} />
        </FloatingDockProvider>
      );
    }

    const { rerender } = render(<Page mobile={true} />);
    expect(screen.getByTestId('probe-chat').dataset.bottom).toBe(
      `calc(var(--floating-dock-base, 16px) + 70px + 3mm)`,
    );

    act(() => {
      rerender(<Page mobile={false} />);
    });
    expect(screen.getByTestId('probe-chat').dataset.bottom).toBe(BASE);
  });
});

describe('useFloatingDockSlot — extensibility (AC6)', () => {
  it('a third party slot inserts itself without affecting unrelated stacks', () => {
    // AC6: a fictitious newcomer registers without anyone else changing.
    render(
      <FloatingDockProvider>
        <Probe id="chat" corner="bottom-right" priority={0} height={56} />
        <Probe id="compare" corner="bottom-right" priority={1} height={64} />
        <Probe id="newcomer" corner="bottom-right" priority={2} height={40} />
      </FloatingDockProvider>,
    );

    // chat / compare keep the SAME positions they had without the newcomer
    expect(screen.getByTestId('probe-chat').dataset.bottom).toBe(BASE);
    expect(screen.getByTestId('probe-compare').dataset.bottom).toBe(
      `calc(var(--floating-dock-base, 16px) + 56px + 3mm)`,
    );
    // newcomer slots above compare: base + (56 + 64)px + (3 + 3)mm
    expect(screen.getByTestId('probe-newcomer').dataset.bottom).toBe(
      `calc(var(--floating-dock-base, 16px) + 120px + 6mm)`,
    );
  });
});

describe('useFloatingDockSlot — viewport-gated siblings keep the gap exact', () => {
  it('a disabled same-priority sibling does not contribute to the stack height (chat dual-launcher case)', () => {
    // Real-world scenario: ChatWidget mounts BOTH a desktop launcher (56 px)
    // and a mobile FAB (48 px), one of which is `enabled: false` depending on
    // the viewport. Compare must stack above the *visible* launcher only —
    // otherwise the gap visible on screen exceeds the declared 3 mm.
    function Page({ mobile }: { mobile: boolean }) {
      return (
        <FloatingDockProvider>
          <Probe
            id="chat-desktop"
            corner="bottom-right"
            priority={0}
            height={56}
            enabled={!mobile}
          />
          <Probe
            id="chat-mobile"
            corner="bottom-right"
            priority={0}
            height={48}
            enabled={mobile}
          />
          <Probe id="compare" corner="bottom-right" priority={1} height={64} />
        </FloatingDockProvider>
      );
    }

    const { rerender } = render(<Page mobile={false} />);
    // Desktop: only the 56 px launcher is enabled. Compare = base + 56px + 3mm.
    expect(screen.getByTestId('probe-compare').dataset.bottom).toBe(
      `calc(var(--floating-dock-base, 16px) + 56px + 3mm)`,
    );

    act(() => {
      rerender(<Page mobile={true} />);
    });
    // Mobile: only the 48 px FAB is enabled. Compare = base + 48px + 3mm.
    expect(screen.getByTestId('probe-compare').dataset.bottom).toBe(
      `calc(var(--floating-dock-base, 16px) + 48px + 3mm)`,
    );
  });
});

describe('useFloatingDockSlot — config validation', () => {
  it('treats slots without explicit priority as priority 0', () => {
    render(
      <FloatingDockProvider>
        <Probe id="a" corner="bottom-right" height={50} />
        <Probe id="b" corner="bottom-right" priority={1} height={30} />
      </FloatingDockProvider>,
    );
    expect(screen.getByTestId('probe-a').dataset.bottom).toBe(BASE);
    expect(screen.getByTestId('probe-b').dataset.bottom).toBe(
      `calc(var(--floating-dock-base, 16px) + 50px + 3mm)`,
    );
  });
});

describe('useFloatingDockSlot — TCK-477, la zone sûre iOS est exigée puis rendue', () => {
  // AC1 (versant type) — les deux cas ci-dessous DOIVENT faire échouer `tsc`. Le
  // `@ts-expect-error` en fait une auto-épreuve : si le type cessait de refuser, `tsc`
  // signalerait une directive inutilisée et `npx tsc --noEmit` sortirait rouge. La
  // garde se surveille donc elle-même, sans qu'on ait à jouer l'ablation à la main.
  it('un `bottom-full` sans encart, ou avec un encart qui n\'en est pas un, ne compile pas', () => {
    const sansEncart = () =>
      // @ts-expect-error TCK-477 — `safeAreaInset` est obligatoire sur un slot `bottom-full`.
      ({ id: 'x', corner: 'bottom-full', height: 70 }) satisfies FloatingDockSlotConfig;

    const encartSansEnv = () =>
      ({
        id: 'x',
        corner: 'bottom-full',
        height: 70,
        // @ts-expect-error TCK-477 — une valeur qui ne contient pas `env(safe-area-inset-bottom)`
        // n'est pas un encart de zone sûre : le type de motif la refuse.
        safeAreaInset: '0.75rem',
      }) satisfies FloatingDockSlotConfig;

    // Les deux fabriques existent pour porter les directives ci-dessus ; à l'exécution
    // elles ne prouvent rien d'autre que leur propre présence.
    expect(typeof sansEncart).toBe('function');
    expect(typeof encartSansEnv).toBe('function');
  });

  // AC2 (versant type) — le témoin légitime. Aucune directive ici : ce littéral DOIT
  // compiler tel quel. S'il cessait de compiler, `tsc` rougirait — c'est-à-dire que
  // l'exigence de `bottom-full` aurait débordé sur `bottom-right`, ce qu'on refuse.
  it('un `bottom-right` se construit sans encart — il ne touche pas le bord bas', () => {
    const temoin = {
      id: 'chat',
      corner: 'bottom-right',
      priority: 0,
      height: 56,
    } satisfies FloatingDockSlotConfig;

    expect(temoin.corner).toBe('bottom-right');
  });

  it('rend l\'encart déclaré à un slot `bottom-full`, et rien à un `bottom-right`', () => {
    render(
      <FloatingDockProvider>
        <Probe id="bar" corner="bottom-full" height={70} />
        <Probe id="chat" corner="bottom-right" priority={0} height={56} />
      </FloatingDockProvider>,
    );
    // La valeur déclarée est celle qui revient : c'est le couplage qui rend
    // « déclarer » et « appliquer » un seul geste.
    expect(screen.getByTestId('probe-bar').dataset.padding).toBe(PROBE_INSET);
    // Le témoin ne reçoit rien, et n'a rien à appliquer.
    expect(screen.getByTestId('probe-chat').dataset.padding).toBe('');
  });

  it('rend l\'encart même hors provider (repli gracieux)', () => {
    render(<Probe id="orphan-full" corner="bottom-full" height={70} />);
    expect(screen.getByTestId('probe-orphan-full').dataset.bottom).toBe('0px');
    expect(screen.getByTestId('probe-orphan-full').dataset.padding).toBe(PROBE_INSET);
  });
});

afterEach(() => {
  cleanup();
});
