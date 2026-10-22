/**
 * TCK-1299 (P113.02) — une vérification de paiement qui ne répond jamais ne suspend plus
 * l'interrogation périodique : la borne des lectures du navigateur (TCK-1297) la fait passer en
 * erreur, et une seconde vérification part. Sans borne, TanStack rendait à chaque tic la promesse en
 * vol (`queryObserver` sans `cancelRefetch`) : un seul appel, jusqu'au démontage.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { createQueryClient } from '@/lib/query-client';
import { withIntl } from '@/test/intl';
import { useVerifyPayment } from '../useInitiatePayment';

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));

const timeoutReel = AbortSignal.timeout.bind(AbortSignal);
let fetchSpy: MockInstance<typeof fetch>;

/** Premier appel : une API figée, qui ne rejette qu'à l'abandon de son signal. Les suivants répondent. */
function premiereFigee() {
  let appels = 0;
  return (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    appels += 1;
    if (appels > 1) {
      return Promise.resolve(new Response(JSON.stringify({ data: { status: 'paid' } }), { status: 200 }));
    }
    return new Promise((_resoudre, rejeter) => {
      const signal = init?.signal;
      if (!signal) return;
      if (signal.aborted) rejeter(signal.reason);
      signal.addEventListener('abort', () => rejeter(signal.reason), { once: true });
    });
  };
}

function Sonde() {
  useVerifyPayment('lease-payments', 12, { refetchInterval: 50 });
  return null;
}

beforeEach(() => {
  // La borne réelle (30 s) n'est pas attendue : elle est ramenée à 20 ms.
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => timeoutReel(20));
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(premiereFigee());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useVerifyPayment — une vérification figée', () => {
  it('une seconde vérification part après la borne', async () => {
    const client = createQueryClient();
    const { unmount } = render(withIntl(<QueryClientProvider client={client}><Sonde /></QueryClientProvider>));

    await vi.waitFor(() => expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(2), { timeout: 3_000 });
    expect(String(fetchSpy.mock.calls[1][0])).toContain('/api/lease-payments/12/verify');

    unmount();
    client.clear();
  });
});
