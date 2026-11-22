// @vitest-environment node
/**
 * TCK-2868 — le relais BFF de « Retélécharger » (`GET /api/me/exports/{id}/download`, TCK-2866) : pas de
 * jeton, pas d'appel ; un segment douteux n'atteint pas l'API ; le fichier revient avec son nom ; un 410
 * (échéance passée) et un 403 passent tels quels, pour que l'écran les dise.
 */
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from '../route';

function requete(cookies: Record<string, string>): NextRequest {
  const req = new NextRequest('http://localhost:3000/api/me/exports/41/download');
  for (const [nom, valeur] of Object.entries(cookies)) req.cookies.set(nom, valeur);
  return req;
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

afterEach(() => vi.unstubAllGlobals());

describe('GET /api/me/exports/[id]/download', () => {
  it('sans jeton : 401, et l’API n’est pas appelée', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await GET(requete({}), ctx('41'));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['..', '41/../../users', '41?x=1'])('segment « %s » : refusé sans appel amont', async (id) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await GET(requete({ auth_token: 'jeton-A' }), ctx(id));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('relaie le fichier avec son nom, sous le jeton de l’auteur, et rien d’autre', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('a;b\n1;2\n', {
        status: 200,
        headers: {
          'content-type': 'text/csv',
          'content-disposition': 'attachment; filename="payments-20261108.csv"',
          'set-cookie': 'laravel_session=secret',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await GET(requete({ auth_token: 'jeton-A' }), ctx('41'));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toMatch(/\/api\/me\/exports\/41\/download$/);
    expect(init.headers).toMatchObject({ Authorization: 'Bearer jeton-A' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="payments-20261108.csv"');
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(await res.text()).toBe('a;b\n1;2\n');
  });

  it.each([410, 403])('un %i de l’API passe tel quel', async (statut) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'export.file_expired' }), { status: statut, headers: { 'content-type': 'application/json' } })));
    const res = await GET(requete({ auth_token: 'jeton-A' }), ctx('41'));
    expect(res.status).toBe(statut);
  });
});
