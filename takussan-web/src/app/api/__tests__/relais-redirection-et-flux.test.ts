// @vitest-environment node
/**
 * TCK-1816 (P108.04) — les relais ne suivent pas une redirection de l'API, et relaient le corps en flux.
 *
 * `relayerVersApi` et le relais du téléchargement de l'export RGPD appelaient `fetch` sans
 * `redirect:` (`follow` par défaut) : une 302 de l'API vers une URL présignée aurait été suivie par
 * le serveur Next, et les octets auraient traversé le VPS, ce que `PrivateMediaAccess::redirect()`
 * existe pour éviter. Ils lisaient aussi le corps entier en mémoire (`arrayBuffer()`) avant de le
 * rendre. Ce test exige une 302 rendue en 302, avec sa `location`, et un corps jamais tamponné.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/headers', () => ({ headers: vi.fn(), cookies: vi.fn() }));

import { headers } from 'next/headers';

import { relayerVersApi } from '@/lib/relais-api';
import { GET as telechargerExport } from '../data-exports/[id]/download/route';

const PRESIGNEE = 'https://seau.example.r2.cloudflarestorage.com/doc.pdf?X-Amz-Signature=abc';
const OCTETS = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0x80, 0x7f]);

const fetchMock = vi.fn();

/** Une réponse amont dont le corps ne doit pas être lu en entier par le relais. */
function amontSurveille(): { reponse: Response; tampon: ReturnType<typeof vi.spyOn> } {
  const reponse = new Response(OCTETS, { status: 200, headers: { 'content-type': 'application/zip' } });
  return { reponse, tampon: vi.spyOn(reponse, 'arrayBuffer') };
}

function requeteExport(): NextRequest {
  const req = new NextRequest('http://localhost:3000/api/data-exports/7/download');
  req.cookies.set('auth_token', 'jeton-A');
  return req;
}

beforeEach(() => {
  vi.mocked(headers).mockResolvedValue(new Headers() as never);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('relayerVersApi : redirection et flux', () => {
  it('ne suit pas une redirection : la 302 de l\'API est rendue en 302, avec sa location', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 302, headers: { location: PRESIGNEE } }));

    const reponse = await relayerVersApi(new NextRequest('http://localhost/api/x'), '/documents/1/versions/2/download', { jeton: '1|abc' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.redirect).toBe('manual');
    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe(PRESIGNEE);
  });

  it('relaie le corps en flux, sans le lire en entier', async () => {
    const { reponse: amont, tampon } = amontSurveille();
    fetchMock.mockResolvedValue(amont);

    const reponse = await relayerVersApi(new NextRequest('http://localhost/api/x'), '/x', { jeton: '1|abc' });

    expect(tampon).not.toHaveBeenCalled();
    expect(new Uint8Array(await reponse.arrayBuffer())).toEqual(OCTETS);
  });
});

describe('GET /api/data-exports/[id]/download : redirection et flux', () => {
  it('ne suit pas une redirection : la 302 de l\'API est rendue en 302, avec sa location', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 302, headers: { location: PRESIGNEE } }));

    const reponse = await telechargerExport(requeteExport(), { params: Promise.resolve({ id: '7' }) });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.redirect).toBe('manual');
    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe(PRESIGNEE);
  });

  it('relaie l\'archive en flux, sans la lire en entier', async () => {
    const { reponse: amont, tampon } = amontSurveille();
    fetchMock.mockResolvedValue(amont);

    const reponse = await telechargerExport(requeteExport(), { params: Promise.resolve({ id: '7' }) });

    expect(tampon).not.toHaveBeenCalled();
    expect(new Uint8Array(await reponse.arrayBuffer())).toEqual(OCTETS);
  });
});
