// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';
import en from '@/messages/en.json';
import wo from '@/messages/wo.json';
import { scriptDuServiceWorker, urlApiDepuisEnv } from '../service-worker';

/**
 * TCK-598 (contrainte 14, ADR-0052 §4) — le script ENGENDRÉ est exécuté dans un bac à sable
 * (`self`, `caches`, `fetch` simulés), et chaque règle se juge sur ce qui entre réellement dans les
 * caches, pas sur la lecture du code.
 */

const SITE = 'https://www.takussan.com';
const API = 'https://api.takussan.com';
const BY_IDS = `${API}/api/public/properties/by-ids?ids=1%2C2`;

interface FausseRequete {
  url: string;
  method: string;
  mode: string;
  credentials: string;
  headers: Headers;
}

function requete(url: string, init: Partial<Omit<FausseRequete, 'headers'>> & { headers?: Record<string, string> } = {}): FausseRequete {
  return {
    url,
    method: init.method ?? 'GET',
    mode: init.mode ?? 'cors',
    credentials: init.credentials ?? 'same-origin',
    headers: new Headers(init.headers ?? {}),
  };
}

function bacASable({ version = 'v1', caches: initiaux = [] as string[] } = {}) {
  const magasins = new Map<string, Map<string, Response>>();
  for (const nom of initiaux) magasins.set(nom, new Map());
  const ecritures: Array<{ cache: string; url: string }> = [];
  const caches = {
    keys: async () => [...magasins.keys()],
    delete: async (nom: string) => magasins.delete(nom),
    open: async (nom: string) => {
      if (!magasins.has(nom)) magasins.set(nom, new Map());
      const m = magasins.get(nom)!;
      return {
        match: async (r: FausseRequete) => m.get(r.url)?.clone(),
        put: async (r: FausseRequete, res: Response) => {
          ecritures.push({ cache: nom, url: r.url });
          m.set(r.url, res);
        },
        keys: async () => [...m.keys()].map((url) => requete(url)),
      };
    },
  };
  const ecouteurs: Record<string, (e: unknown) => void> = {};
  const self = {
    location: { origin: SITE },
    addEventListener: (type: string, f: (e: unknown) => void) => { ecouteurs[type] = f; },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(async () => undefined) },
  };
  const reseau = vi.fn<(r: FausseRequete) => Promise<Response>>();

  const script = scriptDuServiceWorker({
    version,
    urlApi: API,
    textes: { fr: fr.horsLigne, en: en.horsLigne, wo: wo.horsLigne },
  });
  new Function('self', 'caches', 'fetch', 'Response', 'URL', script)(self, caches, reseau, Response, URL);

  /** `undefined` : le worker n'a PAS intercepté la requête (le navigateur la traite seul). */
  async function intercepter(r: FausseRequete): Promise<Response | undefined> {
    let reponse: Promise<Response> | undefined;
    ecouteurs.fetch({ request: r, respondWith: (p: Promise<Response>) => { reponse = p; } });
    return reponse;
  }

  async function activer() {
    let attente: Promise<unknown> | undefined;
    ecouteurs.activate({ waitUntil: (p: Promise<unknown>) => { attente = p; } });
    await attente;
  }

  return { magasins, ecritures, reseau, intercepter, activer, self };
}

const ok = (corps = '{"data":[]}', init: ResponseInit = {}) => new Response(corps, { status: 200, ...init });

describe('service worker — ce qui n\'entre JAMAIS dans un cache', () => {
  it('une navigation HTML en 200 est servie par le réseau et jamais mise en cache', async () => {
    const sw = bacASable();
    sw.reseau.mockResolvedValue(ok('<html>connecté : Awa</html>', { headers: { 'Content-Type': 'text/html' } }));

    const r = await sw.intercepter(requete(`${SITE}/fr/properties`, { mode: 'navigate', headers: { Accept: 'text/html' } }));

    expect(await r!.text()).toContain('Awa');
    expect(sw.ecritures).toEqual([]);
  });

  it('une requête qui accepte text/html hors navigation n\'est pas mise en cache non plus', async () => {
    const sw = bacASable();
    sw.reseau.mockResolvedValue(ok('<html></html>'));

    await sw.intercepter(requete(`${SITE}/_next/static/page.html`, { headers: { Accept: 'text/html' } }));

    expect(sw.ecritures).toEqual([]);
  });

  it('une requête portant Authorization n\'est pas interceptée, même sur by-ids', async () => {
    const sw = bacASable();
    sw.reseau.mockResolvedValue(ok());

    expect(await sw.intercepter(requete(BY_IDS, { headers: { Authorization: 'Bearer abc' } }))).toBeUndefined();
    expect(await sw.intercepter(requete(`${SITE}/_next/static/chunks/a.js`, { headers: { Authorization: 'Bearer abc' } }))).toBeUndefined();
    expect(sw.ecritures).toEqual([]);
  });

  it('une requête avec credentials: include n\'est pas interceptée', async () => {
    const sw = bacASable();
    expect(await sw.intercepter(requete(BY_IDS, { credentials: 'include' }))).toBeUndefined();
  });

  it.each([
    `${SITE}/app/properties`,
    `${SITE}/admin/users`,
    `${SITE}/super-admin/agencies`,
    `${SITE}/api/auth/me`,
    `${SITE}/api/me/favorites`,
    `${SITE}/api/agencies/1`,
    `${SITE}/fr/properties?_rsc=1`,
    `${API}/api/calendar/abc.ics`,
    `${SITE}/calendrier.ics`,
    `${API}/api/public/properties/villa-mermoz`,
    `${API}/api/me`,
    `https://evil.example/api/public/properties/by-ids?ids=1`,
  ])('%s n\'est pas interceptée', async (url) => {
    const sw = bacASable();
    sw.reseau.mockResolvedValue(ok());
    expect(await sw.intercepter(requete(url))).toBeUndefined();
    expect(sw.ecritures).toEqual([]);
  });

  it('un POST sur by-ids n\'est pas intercepté', async () => {
    const sw = bacASable();
    expect(await sw.intercepter(requete(BY_IDS, { method: 'POST' }))).toBeUndefined();
  });

  it('seules les réponses 200 entrent', async () => {
    const sw = bacASable();
    sw.reseau.mockResolvedValue(new Response('{}', { status: 500 }));
    await sw.intercepter(requete(BY_IDS));
    sw.reseau.mockResolvedValue(new Response('', { status: 404 }));
    await sw.intercepter(requete(`${SITE}/_next/static/chunks/absent.js`));
    expect(sw.ecritures).toEqual([]);
  });
});

describe('service worker — ce qui entre', () => {
  it('une ressource de /_next/static est mise en cache, puis servie sans réseau', async () => {
    const sw = bacASable();
    sw.reseau.mockResolvedValue(ok('console.log(1)'));
    const r = requete(`${SITE}/_next/static/chunks/app-123.js`);

    await sw.intercepter(r);
    expect(sw.ecritures).toEqual([{ cache: 'takussan-statique-v1', url: r.url }]);

    sw.reseau.mockRejectedValue(new TypeError('hors ligne'));
    expect(await (await sw.intercepter(r))!.text()).toBe('console.log(1)');
  });

  it('les icônes du manifeste sont mises en cache', async () => {
    const sw = bacASable();
    sw.reseau.mockResolvedValue(ok('png'));
    await sw.intercepter(requete(`${SITE}/icons/icon-192.png`));
    expect(sw.ecritures).toEqual([{ cache: 'takussan-statique-v1', url: `${SITE}/icons/icon-192.png` }]);
  });

  it('by-ids ANONYME : réseau d\'abord, relu depuis le cache hors ligne', async () => {
    const sw = bacASable();
    sw.reseau.mockResolvedValue(ok('{"data":[{"id":1}]}'));
    await sw.intercepter(requete(BY_IDS));
    expect(sw.ecritures).toEqual([{ cache: 'takussan-favoris-v1', url: BY_IDS }]);

    sw.reseau.mockRejectedValue(new TypeError('hors ligne'));
    expect(await (await sw.intercepter(requete(BY_IDS)))!.json()).toEqual({ data: [{ id: 1 }] });
  });

  it('l\'URL de l\'API suit NEXT_PUBLIC_API_URL, suffixe /api compris', () => {
    expect(urlApiDepuisEnv('https://api.takussan.com/api')).toBe('https://api.takussan.com');
    expect(urlApiDepuisEnv(undefined)).toBe('http://localhost:8002');
  });
});

describe('service worker — hors ligne', () => {
  it.each([
    ['/fr/properties/villa', 'fr', fr.horsLigne.titre],
    ['/en/properties', 'en', en.horsLigne.titre],
    ['/wo', 'wo', wo.horsLigne.titre],
    ['/', 'fr', fr.horsLigne.titre],
    ['/zz/x', 'fr', fr.horsLigne.titre],
  ])('une navigation vers %s rend la page hors ligne en %s, sans la mettre en cache', async (chemin, langue, titre) => {
    const sw = bacASable();
    sw.reseau.mockRejectedValue(new TypeError('Failed to fetch'));

    const r = await sw.intercepter(requete(`${SITE}${chemin}`, { mode: 'navigate' }));
    const html = await r!.text();

    expect(r!.headers.get('Content-Type')).toContain('text/html');
    expect(html).toContain(`<html lang="${langue}">`);
    expect(html).toContain(titre);
    expect(html).toContain('takussan.favorites');
    expect(sw.ecritures).toEqual([]);
  });

  it('un texte de dictionnaire ne peut pas injecter de balise', () => {
    const script = scriptDuServiceWorker({
      version: 'v1',
      urlApi: API,
      textes: { fr: { ...fr.horsLigne, titre: '</script><img src=x onerror=alert(1)>' } },
    });
    expect(script).not.toContain('</script><img');
  });
});

describe('service worker — versions', () => {
  it('activate supprime les caches d\'une autre version, garde les siens et ceux d\'autrui', async () => {
    const sw = bacASable({
      version: 'v2',
      caches: ['takussan-statique-v1', 'takussan-favoris-v1', 'takussan-statique-v2', 'autre-application'],
    });

    await sw.activer();

    expect([...sw.magasins.keys()].sort()).toEqual(['autre-application', 'takussan-statique-v2']);
    expect(sw.self.clients.claim).toHaveBeenCalled();
  });
});
