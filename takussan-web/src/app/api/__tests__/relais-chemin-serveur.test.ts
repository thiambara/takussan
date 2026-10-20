// @vitest-environment node
/**
 * TCK-894 (P41.02) — tous les relais BFF joignent l'API par le chemin SERVEUR, avec la langue et
 * l'IP du visiteur.
 *
 * Quinze relais bâtissaient leur URL sur `origineApi()`, l'origine publique, et n'envoyaient ni
 * `X-Forwarded-For` ni `accept-language` : le `fetch` de Node pose alors `accept-language: *`, que
 * l'API ne retient pas, et elle répondait dans la langue du profil plutôt que dans celle de la page.
 *
 * Deux moitiés : la GARDE statique (aucun `route.ts` de `src/app/api` n'appelle `origineApi()`) et
 * l'ÉPREUVE (chaque relais, exécuté contre un `fetch` espion, `API_INTERNAL_URL` posée).
 */
import { globSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/headers', () => ({ headers: vi.fn(), cookies: vi.fn() }));

import { cookies, headers } from 'next/headers';

import * as dataExportDownload from '../data-exports/[id]/download/route';
import * as exportEntity from '../export/[entity]/route';
import * as featureFlags from '../feature-flags/me/route';
import * as maintenance from '../maintenance/status/route';
import * as agentFirstLead from '../me/agent-profiles/[id]/first-lead/route';
import * as agentKycSubmit from '../me/agent-profiles/[id]/kyc/submit/route';
import * as agentKycUpload from '../me/agent-profiles/[id]/kyc/upload/route';
import * as agentSpecialization from '../me/agent-profiles/[id]/specialization/route';
import * as meDataExports from '../me/data-exports/route';
import * as ownerKycSubmit from '../me/owner-profiles/[id]/kyc/submit/route';
import * as ownerKycUpload from '../me/owner-profiles/[id]/kyc/upload/route';
import * as ownerProperties from '../me/owner-profiles/[id]/properties/route';
import * as payouts from '../me/payouts/route';
import * as profileKycUpload from '../me/profiles/[id]/kyc/upload/route';
import * as subscription from '../me/subscription/route';
import * as superAdminUsers from '../super-admin-users/route';

const INTERNE = 'http://api-interne:8000';
const XFF = '198.51.100.66, 203.0.113.7, 10.0.0.2';
const VISITEUR = '203.0.113.7';
const COOKIES: Record<string, string> = { auth_token: '1|abc' };

type Appel = (requete: NextRequest) => Promise<Response>;
const avec = <P extends Record<string, string>>(params: P) => ({ params: Promise.resolve(params) });

const relais: Array<{ nom: string; url: string; methode: string; appel: Appel; amont: RegExp }> = [
  { nom: 'data-exports/[id]/download', url: '/api/data-exports/7/download', methode: 'GET', appel: (r) => dataExportDownload.GET(r, avec({ id: '7' })), amont: /\/api\/data-exports\/7\/download$/ },
  { nom: 'export/[entity]', url: '/api/export/payments?format=csv', methode: 'GET', appel: (r) => exportEntity.GET(r, avec({ entity: 'payments' })), amont: /\/api\/export\/payments\?format=csv$/ },
  { nom: 'feature-flags/me', url: '/api/feature-flags/me', methode: 'GET', appel: (r) => featureFlags.GET(r), amont: /\/api\/feature-flags\/me$/ },
  { nom: 'me/agent-profiles/[id]/first-lead', url: '/api/me/agent-profiles/4/first-lead', methode: 'GET', appel: (r) => agentFirstLead.GET(r, avec({ id: '4' })), amont: /\/api\/me\/agent-profiles\/4\/first-lead$/ },
  { nom: 'me/agent-profiles/[id]/kyc/submit', url: '/api/me/agent-profiles/4/kyc/submit', methode: 'POST', appel: (r) => agentKycSubmit.POST(r, avec({ id: '4' })), amont: /\/api\/me\/agent-profiles\/4\/kyc\/submit$/ },
  { nom: 'me/agent-profiles/[id]/kyc/upload', url: '/api/me/agent-profiles/4/kyc/upload', methode: 'POST', appel: (r) => agentKycUpload.POST(r, avec({ id: '4' })), amont: /\/api\/me\/agent-profiles\/4\/kyc\/upload$/ },
  { nom: 'me/agent-profiles/[id]/specialization', url: '/api/me/agent-profiles/4/specialization', methode: 'PATCH', appel: (r) => agentSpecialization.PATCH(r, avec({ id: '4' })), amont: /\/api\/me\/agent-profiles\/4\/specialization$/ },
  { nom: 'me/data-exports', url: '/api/me/data-exports', methode: 'POST', appel: (r) => meDataExports.POST(r), amont: /\/api\/me\/data-exports$/ },
  { nom: 'me/owner-profiles/[id]/kyc/submit', url: '/api/me/owner-profiles/4/kyc/submit', methode: 'POST', appel: (r) => ownerKycSubmit.POST(r, avec({ id: '4' })), amont: /\/api\/me\/owner-profiles\/4\/kyc\/submit$/ },
  { nom: 'me/owner-profiles/[id]/kyc/upload', url: '/api/me/owner-profiles/4/kyc/upload', methode: 'POST', appel: (r) => ownerKycUpload.POST(r, avec({ id: '4' })), amont: /\/api\/me\/owner-profiles\/4\/kyc\/upload$/ },
  { nom: 'me/owner-profiles/[id]/properties', url: '/api/me/owner-profiles/4/properties?page=2', methode: 'GET', appel: (r) => ownerProperties.GET(r, avec({ id: '4' })), amont: /\/api\/me\/owner-profiles\/4\/properties\?page=2$/ },
  { nom: 'me/payouts', url: '/api/me/payouts?page=2', methode: 'GET', appel: (r) => payouts.GET(r), amont: /\/api\/me\/payouts\?page=2$/ },
  { nom: 'me/profiles/[id]/kyc/upload', url: '/api/me/profiles/4/kyc/upload', methode: 'POST', appel: (r) => profileKycUpload.POST(r, avec({ id: '4' })), amont: /\/api\/me\/profiles\/4\/kyc\/upload$/ },
  { nom: 'me/subscription', url: '/api/me/subscription', methode: 'GET', appel: (r) => subscription.GET(r), amont: /\/api\/me\/subscription$/ },
  { nom: 'super-admin-users', url: '/api/super-admin-users?filter[search]=awa', methode: 'GET', appel: (r) => superAdminUsers.GET(r), amont: /\/api\/admin\/users\?filter/ },
];

const fetchMock = vi.fn();

beforeEach(() => {
  vi.mocked(headers).mockResolvedValue(new Headers({ 'x-forwarded-for': XFF }) as never);
  vi.mocked(cookies).mockResolvedValue({ get: (nom: string) => (nom in COOKIES ? { value: COOKIES[nom] } : undefined) } as never);
  vi.stubEnv('VISITOR_IP_TRUSTED_HOPS', '2');
  vi.stubEnv('API_INTERNAL_URL', INTERNE);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response('{"data":{}}', { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function requete(url: string, methode: string): NextRequest {
  const avecCorps = !['GET', 'HEAD'].includes(methode);
  return new NextRequest(`http://localhost${url}`, {
    method: methode,
    headers: {
      cookie: Object.entries(COOKIES).map(([k, v]) => `${k}=${v}`).join('; '),
      'accept-language': 'en',
      'x-forwarded-for': XFF,
      ...(avecCorps ? { 'content-type': 'application/json' } : {}),
    },
    ...(avecCorps ? { body: '{}', duplex: 'half' } : {}),
  } as never);
}

function seulAppel(): [string, Headers] {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as [string | URL, RequestInit];
  return [String(url), new Headers(init.headers)];
}

describe('garde statique — aucun relais ne joint l\'API par son origine publique', () => {
  const RELAIS = globSync('src/app/api/**/route.ts').filter((f) => !f.includes('__tests__'));

  it('trouve les relais (sans quoi la garde ne garderait rien)', () => {
    expect(RELAIS.length).toBeGreaterThanOrEqual(30);
  });

  it.each(RELAIS)('%s', (fichier) => {
    expect(readFileSync(fichier, 'utf8')).not.toMatch(/\borigineApi\s*\(/);
  });
});

describe('relais BFF : chemin serveur, langue et IP du visiteur', () => {
  it.each(relais)('$nom', async ({ url, methode, appel, amont }) => {
    const reponse = await appel(requete(url, methode));

    expect(reponse.status).toBe(200);
    const [urlAmont, envoyes] = seulAppel();
    expect(urlAmont.startsWith(`${INTERNE}/api/`)).toBe(true);
    expect(urlAmont).toMatch(amont);
    expect(envoyes.get('accept-language')).toBe('en');
    expect(envoyes.get('x-forwarded-for')).toBe(VISITEUR);
    expect(envoyes.get('x-forwarded-proto')).toBeTruthy();
    // TCK-1058 (P73.01) — l'hôte des URL vient d'`APP_URL`, côté API : l'en-tête ne part plus.
    expect(envoyes.get('x-forwarded-host')).toBeNull();
    expect(envoyes.get('authorization')).toBe('Bearer 1|abc');
  });

  it('maintenance/status, appel partagé et mis en cache : chemin serveur, sans en-tête propre au visiteur', async () => {
    const reponse = await maintenance.GET();

    expect(reponse.status).toBe(200);
    const [urlAmont, envoyes] = seulAppel();
    expect(urlAmont).toBe(`${INTERNE}/api/maintenance/status`);
    expect(envoyes.get('x-forwarded-proto')).toBeTruthy();
    // TCK-1058 (P73.01) — l'hôte des URL vient d'`APP_URL`, côté API : l'en-tête ne part plus.
    expect(envoyes.get('x-forwarded-host')).toBeNull();
    expect(envoyes.get('x-forwarded-for')).toBeNull();
    expect(envoyes.get('accept-language')).toBeNull();
  });
});
