// @vitest-environment node
/**
 * TCK-1308 (piste P112.03) — l'API signale un export coupé au plafond par `X-Export-Truncated`.
 * Le relais le transmet au navigateur, qui le dit à l'écran ; sans lui, la coupure redevenait muette.
 */
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (nom: string) => (nom === 'auth_token' ? { value: 'jeton-A' } : undefined) }),
}));

const { GET } = await import('../route');

afterEach(() => {
  vi.unstubAllGlobals();
});

async function relayer(enTetes: Record<string, string>) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('id\n', { status: 200, headers: enTetes })));
  return GET(new NextRequest('http://localhost/api/export/payments?format=csv'), {
    params: Promise.resolve({ entity: 'payments' }),
  });
}

describe('GET /api/export/[entity] — coupure au plafond (TCK-1308)', () => {
  it('transmet X-Export-Truncated', async () => {
    const res = await relayer({ 'content-type': 'text/csv', 'x-export-truncated': '5000' });

    expect(res.headers.get('x-export-truncated')).toBe('5000');
  });

  it('n’invente rien quand l’API ne coupe pas', async () => {
    const res = await relayer({ 'content-type': 'text/csv' });

    expect(res.headers.get('x-export-truncated')).toBeNull();
  });
});
