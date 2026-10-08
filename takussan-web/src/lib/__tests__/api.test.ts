// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `next/headers` is only resolvable inside a Next.js request context. Mock it
// so we can simulate the visitor's incoming request from a unit test.
vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

import { apiRequest } from '../api';
import { headers } from 'next/headers';

const headersMock = vi.mocked(headers);

function makeIncomingHeaders(map: Record<string, string>): Headers {
  const h = new Headers();
  for (const [k, v] of Object.entries(map)) {
    h.set(k, v);
  }
  return h;
}

describe('apiRequest — visitor IP forwarding', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    headersMock.mockReset();
  });

  // TCK-598 — ces deux cas affirmaient l'ancien comportement : l'entrée la plus à GAUCHE de
  // `X-Forwarded-For` (celle que le client écrit), puis `X-Real-IP` en repli. Ils affirment
  // désormais la chaîne de confiance (un saut par défaut) — le détail vit dans
  // `api.ip-du-visiteur.test.ts`.
  it('forwards the entry written by the trusted proxy, not the left-most one', async () => {
    headersMock.mockResolvedValue(
      makeIncomingHeaders({ 'x-forwarded-for': '198.51.100.9, 203.0.113.10' }) as Awaited<
        ReturnType<typeof headers>
      >,
    );

    await apiRequest('/api/test');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const sentHeaders = init.headers as Record<string, string>;
    expect(sentHeaders['X-Forwarded-For']).toBe('203.0.113.10');
  });

  it('no longer falls back to x-real-ip, which nothing in the trusted chain vouches for', async () => {
    headersMock.mockResolvedValue(
      makeIncomingHeaders({ 'x-real-ip': '198.51.100.7' }) as Awaited<
        ReturnType<typeof headers>
      >,
    );

    await apiRequest('/api/test');

    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const sentHeaders = init.headers as Record<string, string>;
    expect(sentHeaders['X-Forwarded-For']).toBeUndefined();
  });

  it('does not override a caller-provided X-Forwarded-For header', async () => {
    headersMock.mockResolvedValue(
      makeIncomingHeaders({ 'x-forwarded-for': '203.0.113.10' }) as Awaited<
        ReturnType<typeof headers>
      >,
    );

    await apiRequest('/api/test', {
      headers: { 'X-Forwarded-For': 'explicit-value' },
    });

    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const sentHeaders = init.headers as Record<string, string>;
    expect(sentHeaders['X-Forwarded-For']).toBe('explicit-value');
  });

  it('omits X-Forwarded-For when no visitor IP can be resolved', async () => {
    // Outside a request context (build-time, scripts) `headers()` throws.
    headersMock.mockRejectedValue(new Error('outside request scope'));

    await apiRequest('/api/test');

    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const sentHeaders = init.headers as Record<string, string>;
    expect(sentHeaders['X-Forwarded-For']).toBeUndefined();
  });
});
