// @vitest-environment node
/**
 * TCK-595 (§7, AC19) — le BFF d'export laisse passer les cinq exports financiers jusqu'à l'API.
 *
 * Sa liste d'entités est une garde : un export que l'API sert mais que le BFF ignore rend 404 au
 * navigateur, sans qu'aucune requête n'atteigne Laravel.
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

describe('GET /api/export/[entity] — exports financiers', () => {
  it.each(['payouts', 'invoices', 'commissions', 'aging', 'deposits'])('relaie %s à l’API', async (entity) => {
    const fetchSpy = vi.fn(async () => new Response('id\n', { status: 200, headers: { 'content-type': 'text/csv' } }));
    vi.stubGlobal('fetch', fetchSpy);

    const res = await GET(new NextRequest(`http://localhost/api/export/${entity}?format=csv`), {
      params: Promise.resolve({ entity }),
    });

    expect(res.status).toBe(200);
    expect(String((fetchSpy.mock.calls[0] as unknown[])[0])).toContain(`/api/export/${entity}?format=csv`);
  });

  it('refuse toujours une entité inconnue', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const res = await GET(new NextRequest('http://localhost/api/export/secrets'), {
      params: Promise.resolve({ entity: 'secrets' }),
    });

    expect(res.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
