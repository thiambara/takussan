import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';

import { MinimalProfileTriggerProvider } from '../MinimalProfileTriggerProvider';
import { useTriggerMinimalProfileOnce } from '@/hooks/useTriggerMinimalProfileOnce';
import * as AuthContext from '@/context/AuthContext';
import frMessages from '@/messages/fr.json';

type FetchMock = ReturnType<typeof vi.fn>;

function setupFetchSequence(
  responses: Array<{ status?: number; json?: () => Promise<unknown> }>,
): FetchMock {
  const mock = vi.fn();
  responses.forEach((r) => {
    mock.mockImplementationOnce(async () => ({
      ok: (r.status ?? 200) >= 200 && (r.status ?? 200) < 300,
      status: r.status ?? 200,
      json: r.json ?? (async () => ({})),
    }));
  });
  // Default for any extra calls — return an empty success.
  mock.mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
  }));
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

function mockAuth(authed: boolean) {
  const value = authed
    ? {
        user: { id: 1, first_name: 'Alice', last_name: 'X', email: 'a@b.c' },
        token: 'tk',
        isLoading: false,
        setUser: vi.fn(),
        refreshUser: vi.fn(),
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
      }
    : { user: null, token: null, isLoading: false };
  vi.spyOn(AuthContext, 'useAuth').mockReturnValue(
    value as unknown as ReturnType<typeof AuthContext.useAuth>,
  );
}

function Wrapper({ children, roles }: { children: ReactNode; roles: string[] }) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages as never}>
      <MinimalProfileTriggerProvider roles={roles}>{children}</MinimalProfileTriggerProvider>
    </NextIntlClientProvider>
  );
}

function TriggerButton() {
  const { triggerIfNeeded } = useTriggerMinimalProfileOnce();
  return (
    <button data-testid="fire" onClick={() => triggerIfNeeded()}>
      fire
    </button>
  );
}

describe('MinimalProfileTriggerProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the sheet on the first trigger when key not seen', async () => {
    mockAuth(true);
    setupFetchSequence([{ status: 200, json: async () => ({ data: [] }) }]);

    render(
      <Wrapper roles={['customer']}>
        <TriggerButton />
      </Wrapper>,
    );

    // Wait for the welcome-seen pre-fetch to land before firing.
    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as FetchMock).mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.click(screen.getByTestId('fire'));

    await waitFor(() =>
      expect(screen.getByTestId('customer-minimal-profile-title')).toBeInTheDocument(),
    );
  });

  it('does NOT open the sheet on subsequent triggers (single-shot per session)', async () => {
    mockAuth(true);
    setupFetchSequence([{ status: 200, json: async () => ({ data: [] }) }]);

    render(
      <Wrapper roles={['customer']}>
        <TriggerButton />
      </Wrapper>,
    );

    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as FetchMock).mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.click(screen.getByTestId('fire'));
    await waitFor(() =>
      expect(screen.getByTestId('customer-minimal-profile-title')).toBeInTheDocument(),
    );

    // Skip closes + marks seen.
    fireEvent.click(screen.getByTestId('customer-minimal-profile-skip'));
    await waitFor(() =>
      expect(screen.queryByTestId('customer-minimal-profile-title')).not.toBeInTheDocument(),
    );

    // 2nd trigger must be a no-op.
    fireEvent.click(screen.getByTestId('fire'));
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 10));
    });
    expect(screen.queryByTestId('customer-minimal-profile-title')).not.toBeInTheDocument();
  });

  it('does nothing for non-customer roles', async () => {
    mockAuth(true);
    const fetchMock = setupFetchSequence([
      { status: 200, json: async () => ({ data: [] }) },
    ]);

    render(
      <Wrapper roles={['agent']}>
        <TriggerButton />
      </Wrapper>,
    );

    fireEvent.click(screen.getByTestId('fire'));
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 10));
    });

    expect(screen.queryByTestId('customer-minimal-profile-title')).not.toBeInTheDocument();
    // Pre-fetch is gated too — non-customers never hit /api/me/welcome-seen.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not open if the welcome-seen prefetch already includes the key', async () => {
    mockAuth(true);
    setupFetchSequence([
      { status: 200, json: async () => ({ data: ['customer-profile-minimal'] }) },
    ]);

    render(
      <Wrapper roles={['customer']}>
        <TriggerButton />
      </Wrapper>,
    );

    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as FetchMock).mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.click(screen.getByTestId('fire'));
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 10));
    });

    expect(screen.queryByTestId('customer-minimal-profile-title')).not.toBeInTheDocument();
  });
});

export {};
