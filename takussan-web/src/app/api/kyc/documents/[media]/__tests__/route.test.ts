// @vitest-environment node
/**
 * TCK-1519 (P73.03, TCK-546) — le relais de la pièce KYC.
 *
 * Un clic sur une pièce est une navigation, sans `Authorization` : l'API, qui garde la route sous
 * `auth:sanctum`, rendait 401. Le relais pose le jeton du cookie et le profil actif, et transmet la
 * chaîne signée telle quelle (signature relative, TCK-1059) ; il ne juge rien lui-même.
 */
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from '../route';
import { origineApi } from '@/lib/config-publique';

const API = origineApi();
const REQUETE = '?expires=1700000000&signature=abc';

function requete(cookies: Record<string, string>): NextRequest {
  const req = new NextRequest(`http://localhost:3000/api/kyc/documents/42${REQUETE}`, {
    headers: { accept: 'text/html' },
  });
  for (const [nom, valeur] of Object.entries(cookies)) req.cookies.set(nom, valeur);
  return req;
}

const ctx = (media: string) => ({ params: Promise.resolve({ media }) });

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0x80]);

afterEach(() => vi.unstubAllGlobals());

describe('GET /api/kyc/documents/[media]', () => {
  it('sans jeton : 401, et l\'API n\'est pas appelée', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await GET(requete({}), ctx('42'));

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['..', '42/../../admin', '42?x=1'])('segment « %s » : refusé sans appel amont', async (media) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await GET(requete({ auth_token: 'jeton-A' }), ctx(media));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('relaie la signature en Bearer avec le profil actif, et rend la pièce octet pour octet', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(PDF, {
        status: 200,
        headers: { 'content-type': 'application/pdf', 'content-disposition': 'inline; filename="rccm.pdf"', 'set-cookie': 'x=y' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await GET(requete({ auth_token: 'jeton-A', active_profile_id: '9' }), ctx('42'));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API}/api/kyc/documents/42${REQUETE}`);
    expect(init.headers).toMatchObject({ Authorization: 'Bearer jeton-A', 'X-Active-Profile-Hint': '9' });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe('inline; filename="rccm.pdf"');
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF);
  });

  it('un refus de l\'API (signature expirée) revient tel quel', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ message: 'Forbidden' }, { status: 403 })));

    const res = await GET(requete({ auth_token: 'jeton-A' }), ctx('42'));

    expect(res.status).toBe(403);
  });
});
