// @vitest-environment node
/**
 * TCK-893 (P41.03) — les six relais BFF passent par `relayerVersApi()`, et relaient tous de même.
 *
 * Chacun réécrivait son `forward()`, et chacun divergeait : `request.text()` dans trois d'entre eux
 * (tout octet hors UTF-8 remplacé par U+FFFD, le défaut de TCK-601), `content-type` seul relayé en
 * réponse dans quatre, ni `accept-language` ni chemin serveur dans cinq. Ce test tient les six sur
 * le même contrat.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/headers', () => ({ headers: vi.fn(), cookies: vi.fn() }));

import { headers } from 'next/headers';

import * as superAdmin from '../super-admin/[...path]/route';
import * as agencies from '../agencies/[[...path]]/route';
import * as adminUsers from '../admin-users/[[...path]]/route';
import * as superAdminProperties from '../super-admin-properties/[[...path]]/route';
import * as announcements from '../announcements/[...path]/route';
import * as impersonationProxy from '../impersonation/proxy/[...path]/route';

const INTERNE = 'http://api-interne:8000';
const XFF = '198.51.100.66, 203.0.113.7, 10.0.0.2';
const VISITEUR = '203.0.113.7';
const OCTETS = [0xff, 0x80, 0x00, 0x41];

type Handler = (request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) => Promise<Response>;

const relais: Array<{ nom: string; handler: Handler; url: string; cookie: string; path: string[]; amont: RegExp }> = [
  { nom: 'super-admin', handler: superAdmin.POST as Handler, url: '/api/super-admin/privacy-requests/3', cookie: 'auth_token=1|abc', path: ['privacy-requests', '3'], amont: /\/api\/admin\/privacy-requests\/3$/ },
  { nom: 'agencies', handler: agencies.POST as Handler, url: '/api/agencies/5/kyc/documents', cookie: 'auth_token=1|abc', path: ['5', 'kyc', 'documents'], amont: /\/api\/agencies\/5\/kyc\/documents$/ },
  { nom: 'admin-users', handler: adminUsers.POST as Handler, url: '/api/admin-users/7', cookie: 'auth_token=1|abc', path: ['7'], amont: /\/api\/users\/7$/ },
  { nom: 'super-admin-properties', handler: superAdminProperties.POST as Handler, url: '/api/super-admin-properties/12', cookie: 'auth_token=1|abc', path: ['12'], amont: /\/api\/properties\/12$/ },
  { nom: 'announcements', handler: announcements.POST as Handler, url: '/api/announcements/3/dismiss', cookie: 'auth_token=1|abc', path: ['3', 'dismiss'], amont: /\/api\/announcements\/3\/dismiss$/ },
  { nom: 'impersonation/proxy', handler: impersonationProxy.POST as Handler, url: '/api/impersonation/proxy/properties/12', cookie: 'impersonation_token=imp|xyz', path: ['properties', '12'], amont: /\/api\/properties\/12$/ },
];

const fetchMock = vi.fn();

beforeEach(() => {
  vi.mocked(headers).mockResolvedValue(new Headers({ 'x-forwarded-for': XFF }) as never);
  vi.stubEnv('VISITOR_IP_TRUSTED_HOPS', '2');
  vi.stubEnv('API_INTERNAL_URL', INTERNE);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response('{"data":{}}', {
      status: 200,
      headers: { 'content-type': 'application/json', 'content-disposition': 'attachment; filename="a.pdf"', 'cache-control': 'private, max-age=30' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('relais BFF : un seul contrat (relayerVersApi)', () => {
  for (const { nom, handler, url, cookie, path, amont } of relais) {
    it(`${nom} relaie octets, langue, chemin serveur et en-têtes de réponse`, async () => {
      const requete = new NextRequest(`http://localhost${url}`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'multipart/form-data; boundary=x', 'accept-language': 'en', 'x-forwarded-for': XFF },
        body: new Uint8Array(OCTETS),
      });

      const reponse = await handler(requete, { params: Promise.resolve({ path }) });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [urlAmont, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(urlAmont.startsWith(`${INTERNE}/api/`)).toBe(true);
      expect(urlAmont).toMatch(amont);
      const envoyes = new Headers(init.headers);
      expect(envoyes.get('accept-language')).toBe('en');
      expect(envoyes.get('content-type')).toBe('multipart/form-data; boundary=x');
      expect(envoyes.get('x-forwarded-for')).toBe(VISITEUR);
      expect(envoyes.get('x-forwarded-host')).toBe('localhost');
      expect(Array.from(new Uint8Array(init.body as ArrayBuffer))).toEqual(OCTETS);

      expect(reponse.status).toBe(200);
      expect(reponse.headers.get('content-type')).toBe('application/json');
      expect(reponse.headers.get('content-disposition')).toBe('attachment; filename="a.pdf"');
      expect(reponse.headers.get('cache-control')).toBe('private, max-age=30');
      expect(await reponse.text()).toBe('{"data":{}}');
    });
  }
});
