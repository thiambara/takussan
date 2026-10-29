// @vitest-environment node
/**
 * TCK-601 — le BFF de la console relaie un corps multipart OCTET POUR OCTET.
 *
 * La preuve de réponse du registre des droits est le premier fichier que la console envoie. Le
 * handler relisait le corps par `request.text()`, qui décode en UTF-8 : tout octet hors UTF-8
 * (un PDF, une photo) ressortait remplacé par U+FFFD, et Laravel recevait un fichier corrompu
 * sans qu'aucune erreur ne le dise.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { POST, PATCH } = await import('../route');

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('{"data":{}}', { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ctx = (path: string[]) => ({ params: Promise.resolve({ path }) });

describe('BFF /api/super-admin/[...path]', () => {
  it('un fichier binaire en multipart arrive intact à Laravel', async () => {
    // Des octets qui ne forment pas de l'UTF-8 valide : 0xFF, 0xFE, 0x80…
    const octets = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0xff, 0xfe, 0x80, 0x00, 0xc3, 0x28]);
    const form = new FormData();
    form.append('_method', 'PATCH');
    form.append('proof', new Blob([octets], { type: 'application/pdf' }), 'reponse.pdf');
    const source = new Request('http://localhost/x', { method: 'POST', body: form });
    const contentType = source.headers.get('content-type')!;
    const corps = new Uint8Array(await source.arrayBuffer());

    const requete = new NextRequest('http://localhost/api/super-admin/privacy-requests/3', {
      method: 'POST',
      headers: { 'content-type': contentType, cookie: 'auth_token=1|abc' },
      body: corps,
    });
    await POST(requete, ctx(['privacy-requests', '3']));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/admin\/privacy-requests\/3$/);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(contentType);
    const relaye = new Uint8Array(init.body as ArrayBuffer);
    expect(Array.from(relaye)).toEqual(Array.from(corps));
  });

  it('l\'en-tête Idempotency-Key part avec l\'écriture, et rien d\'autre du navigateur', async () => {
    const requete = new NextRequest('http://localhost/api/super-admin/radar/advertisers/7/publish', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'auth_token=1|abc',
        'idempotency-key': '8f14e45f-ceea-4e67-9d2a-1c2f3b4a5d6e',
        'x-autre': 'ne-passe-pas',
      },
      body: JSON.stringify({ listing_ids: [1] }),
    });
    await POST(requete, ctx(['radar', 'advertisers', '7', 'publish']));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/admin\/radar\/advertisers\/7\/publish$/);
    const en = init.headers as Record<string, string>;
    expect(en['Idempotency-Key']).toBe('8f14e45f-ceea-4e67-9d2a-1c2f3b4a5d6e');
    expect(en['x-autre']).toBeUndefined();
  });

  it('sans Idempotency-Key, aucune clé n\'est inventée par le relais', async () => {
    const requete = new NextRequest('http://localhost/api/super-admin/radar/advertisers/7/claim', {
      method: 'POST',
      headers: { cookie: 'auth_token=1|abc' },
    });
    await POST(requete, ctx(['radar', 'advertisers', '7', 'claim']));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBeUndefined();
  });

  it('un corps JSON reste relayé tel quel', async () => {
    const requete = new NextRequest('http://localhost/api/super-admin/privacy-requests/3', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: 'auth_token=1|abc' },
      body: JSON.stringify({ status: 'answered' }),
    });
    await PATCH(requete, ctx(['privacy-requests', '3']));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('{"status":"answered"}');
  });
});
