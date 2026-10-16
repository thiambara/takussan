import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TIMEZONE } from '@/i18n/config';
import { useGenerateSchedule } from '../leases';

// TCK-682 (P13.02) — « Générer l'échéancier » postait sur
// `/api/leases/{id}/generate-schedule`, une route qui n'existe pas : la seule
// est `POST api/leases/{lease}/payments/generate-schedule`
// (`routes/api/leases.php`), et elle rend `{ data: { payments_created } }`
// (`LeaseController::generateSchedule`), pas `generated`.

function mockFetch(response: unknown) {
  const spy = vi.fn(
    async (..._args: Parameters<typeof fetch>): Promise<unknown> => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => response,
      text: async () => JSON.stringify(response),
    }),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <NextIntlClientProvider locale="fr" messages={{}} timeZone={TIMEZONE} now={new Date()}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useGenerateSchedule — le chemin et la réponse de la route réelle (TCK-682)', () => {
  it('poste sur /api/leases/{id}/payments/generate-schedule et lit payments_created', async () => {
    const spy = mockFetch({ data: { payments_created: 12 } });

    const { result } = renderHook(() => useGenerateSchedule(42), { wrapper });

    let reponse: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      reponse = await result.current.mutateAsync({});
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0];
    const chemin = new URL(String(url), 'http://localhost').pathname;
    expect(chemin).toBe('/api/leases/42/payments/generate-schedule');
    expect(init?.method).toBe('POST');

    // Le type de la réponse porte la clé que l'API émet : `tsc` refuse ce test
    // si le hook se remet à annoncer `generated`.
    expect(reponse?.data.payments_created).toBe(12);
  });
});
