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

const BASE = 'var(--floating-dock-base, 16px)';

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
  const { bottom } = useFloatingDockSlot({ id, corner, priority, height, enabled });
  return (
    <div data-testid={`probe-${id}`} data-bottom={bottom}>
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

afterEach(() => {
  cleanup();
});
