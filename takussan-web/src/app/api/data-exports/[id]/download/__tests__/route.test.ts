// @vitest-environment node
/**
 * TCK-760 (P12.09) — le relais BFF du téléchargement de l'export RGPD.
 *
 * Ce handler remet à l'utilisateur l'archive de SES données personnelles. Il n'avait aucun test :
 * les deux gardes génériques de `src/app/api/__tests__/` n'éprouvent pas son chemin nominal. Ce
 * fichier tient son contrat : pas de jeton, pas d'appel ; un segment douteux n'atteint pas l'API ;
 * l'archive revient octet pour octet, avec son statut et ses trois en-têtes, et rien d'autre.
 */
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from '../route';

const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8002').replace(/\/api$/, '');

function requete(cookies: Record<string, string>): NextRequest {
  const req = new NextRequest('http://localhost:3000/api/data-exports/7/download');
  for (const [nom, valeur] of Object.entries(cookies)) req.cookies.set(nom, valeur);
  return req;
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** Une archive factice : des octets non textuels, pour qu'un passage par du texte se voie. */
const ARCHIVE = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0x80, 0x7f]);

afterEach(() => vi.unstubAllGlobals());

describe('GET /api/data-exports/[id]/download', () => {
  it('sans jeton : 401, et l\'API n\'est pas appelée', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await GET(requete({}), ctx('7'));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: 'unauthenticated' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['..', '7/../../users', '7?x=1'])('segment « %s » : refusé sans appel amont', async (id) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await GET(requete({ auth_token: 'jeton-A' }), ctx(id));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('relaie l\'archive octet pour octet, avec son statut et ses trois en-têtes, et rien d\'autre', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(ARCHIVE, {
        status: 200,
        headers: {
          'content-type': 'application/zip',
          'content-disposition': 'attachment; filename="takussan-export-7.zip"',
          'content-length': String(ARCHIVE.byteLength),
          'set-cookie': 'laravel_session=secret',
          'x-powered-by': 'PHP',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await GET(requete({ auth_token: 'jeton-A' }), ctx('7'));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API}/api/data-exports/7/download`);
    expect(init.headers).toMatchObject({ Authorization: 'Bearer jeton-A' });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="takussan-export-7.zip"');
    expect(res.headers.get('content-length')).toBe(String(ARCHIVE.byteLength));
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(ARCHIVE);
  });

  it('pendant une impersonation, c\'est le jeton de la cible qui part', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(ARCHIVE, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await GET(requete({ auth_token: 'jeton-operateur', impersonation_token: 'jeton-cible' }), ctx('7'));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ Authorization: 'Bearer jeton-cible' });
  });

  it('une erreur amont garde son statut et son corps', async () => {
    const corps = JSON.stringify({ code: 'export_expired' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(corps, { status: 410, headers: { 'content-type': 'application/json' } }),
      ),
    );

    const res = await GET(requete({ auth_token: 'jeton-A' }), ctx('7'));

    expect(res.status).toBe(410);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual({ code: 'export_expired' });
  });
});
