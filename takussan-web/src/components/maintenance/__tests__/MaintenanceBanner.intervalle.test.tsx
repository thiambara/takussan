import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/test/intl';

/**
 * TCK-1227 (P103.08) — le statut de maintenance se relit toutes les 60 s avec une session, toutes
 * les 5 minutes pour un visiteur sans session (décision du porteur, 2026-10-22).
 */

const auth = vi.hoisted(() => ({ user: null as null | { roles: string[] } }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace: vi.fn() }),
}));

import { MaintenanceBanner } from '../MaintenanceBanner';

const fetchMock = vi.fn();

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>{withIntl(<MaintenanceBanner />, 'fr')}</QueryClientProvider>,
  );
}

async function avancer(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ data: { active: false, show_banner: false } }) }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  auth.user = null;
});

describe('<MaintenanceBanner> — intervalle de relecture', () => {
  it('sans session : aucune relecture à 61 s, une à 5 minutes', async () => {
    monter();
    await avancer(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await avancer(61_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await avancer(300_000 - 61_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('avec une session : une relecture à 61 s', async () => {
    auth.user = { roles: ['owner'] };
    monter();
    await avancer(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await avancer(61_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
