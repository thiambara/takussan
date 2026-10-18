// @vitest-environment node
/**
 * TCK-848 (P41.01) — un relais BFF rend 204 quand l'API répond 204.
 *
 * Les relais lisaient le corps amont (`text()`, `arrayBuffer()`) puis le passaient à
 * `new NextResponse(corps, { status })`. Un corps non nul, même vide, avec un statut 204, 205 ou
 * 304 fait lever le constructeur (`Invalid response status code 204`) : Next rendait 500 alors que
 * la suppression était faite (bien, règle d'alerte, prise de modération rendue). `agencies` traitait
 * déjà ces statuts à part ; ce test tient les cinq autres.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import * as superAdmin from '../super-admin/[...path]/route';
import * as superAdminProperties from '../super-admin-properties/[[...path]]/route';
import * as adminUsers from '../admin-users/[[...path]]/route';
import * as announcements from '../announcements/[...path]/route';
import * as impersonationProxy from '../impersonation/proxy/[...path]/route';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

type Handler = (request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) => Promise<Response>;

const relais: Array<{ nom: string; handler: Handler; url: string; methode: string; cookie: string; path: string[] }> = [
  { nom: 'super-admin', handler: superAdmin.DELETE as Handler, url: '/api/super-admin/alert-rules/4', methode: 'DELETE', cookie: 'auth_token=1|abc', path: ['alert-rules', '4'] },
  { nom: 'super-admin-properties', handler: superAdminProperties.DELETE as Handler, url: '/api/super-admin-properties/12', methode: 'DELETE', cookie: 'auth_token=1|abc', path: ['12'] },
  { nom: 'admin-users', handler: adminUsers.DELETE as Handler, url: '/api/admin-users/7', methode: 'DELETE', cookie: 'auth_token=1|abc', path: ['7'] },
  { nom: 'announcements', handler: announcements.POST as Handler, url: '/api/announcements/3/dismiss', methode: 'POST', cookie: 'auth_token=1|abc', path: ['3', 'dismiss'] },
  { nom: 'impersonation/proxy', handler: impersonationProxy.DELETE as Handler, url: '/api/impersonation/proxy/properties/12', methode: 'DELETE', cookie: 'impersonation_token=imp|xyz', path: ['properties', '12'] },
];

describe('relais BFF : statuts sans corps', () => {
  for (const { nom, handler, url, methode, cookie, path } of relais) {
    for (const statut of [204, 205, 304]) {
      it(`${nom} rend ${statut} quand l'API répond ${statut}`, async () => {
        fetchMock.mockResolvedValue(new Response(null, { status: statut }));
        const requete = new NextRequest(`http://localhost${url}`, { method: methode, headers: { cookie } });

        const reponse = await handler(requete, { params: Promise.resolve({ path }) });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(reponse.status).toBe(statut);
        expect(reponse.body).toBeNull();
      });
    }
  }

  it('un 200 garde son corps', async () => {
    fetchMock.mockResolvedValue(new Response('{"data":[]}', { status: 200, headers: { 'content-type': 'application/json' } }));
    const requete = new NextRequest('http://localhost/api/admin-users', { method: 'GET', headers: { cookie: 'auth_token=1|abc' } });

    const reponse = await (adminUsers.GET as Handler)(requete, { params: Promise.resolve({ path: [] }) });

    expect(reponse.status).toBe(200);
    expect(await reponse.text()).toBe('{"data":[]}');
  });
});
