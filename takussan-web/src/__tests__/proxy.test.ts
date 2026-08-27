import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { LOCALE_COOKIE_NAME } from '@/i18n/config';
import { ENTETE_LOCALE_NEXT_INTL, config, proxy } from '../proxy';

/**
 * Le garde de route — TCK-434 / ADR-0026.
 *
 * On appelle la fonction EXPORTÉE, pas une copie de sa logique : c'est la seule forme qui rougisse
 * si la règle bouge dans `proxy.ts`. `NextRequest` est construit tel quel, sans mock — il n'a besoin
 * que d'une URL et d'en-têtes.
 */
function requete(
  chemin: string,
  { cookies = {}, entetes = {} }: { cookies?: Record<string, string>; entetes?: Record<string, string> } = {},
): NextRequest {
  const headers = new Headers(entetes);
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  if (cookie) headers.set('cookie', cookie);
  return new NextRequest(new URL(chemin, 'https://www.takussan.com'), { headers });
}

const cheminDe = (location: string) => new URL(location, 'https://www.takussan.com').pathname;

describe('AC4 — une URL publique de la forme actuelle ne rend jamais 404', () => {
  it('redirige une fiche de bien vers la même fiche préfixée', () => {
    const r = proxy(requete('/properties/studio-meuble-a-parcelles-assainies-5Kyslt'));
    expect(r.status).toBe(307);
    expect(cheminDe(r.headers.get('location')!)).toBe(
      '/fr/properties/studio-meuble-a-parcelles-assainies-5Kyslt',
    );
  });

  it('redirige la racine, la liste et les profils publics', () => {
    for (const [avant, apres] of [
      ['/', '/fr'],
      ['/properties', '/fr/properties'],
      ['/agencies/immo-dakar', '/fr/agencies/immo-dakar'],
      ['/agents/awa-diop', '/fr/agents/awa-diop'],
    ] as const) {
      const r = proxy(requete(avant));
      expect(r.status, avant).toBe(307);
      expect(cheminDe(r.headers.get('location')!), avant).toBe(apres);
    }
  });

  it('conserve la chaîne de requête — un lien de recherche partagé garde ses filtres', () => {
    const r = proxy(requete('/properties?filter%5Bcity%5D=Dakar&sort=-created_at'));
    const url = new URL(r.headers.get('location')!, 'https://www.takussan.com');
    expect(url.pathname).toBe('/fr/properties');
    expect(url.searchParams.get('filter[city]')).toBe('Dakar');
    expect(url.searchParams.get('sort')).toBe('-created_at');
  });

  it('annonce ce dont la redirection dépend — sans Vary, un cache partagé épinglerait une langue', () => {
    const r = proxy(requete('/properties'));
    expect(r.headers.get('Vary')).toBe('Cookie, Accept-Language');
  });

  it('307 et NON 308 : la cible dépend du demandeur, pas de l’URL source', () => {
    // Un 308 serait mis en cache par le navigateur et par tout cache partagé : la langue du
    // premier visiteur serait servie à tous les suivants — le défaut corrigé, rendu persistant.
    expect(proxy(requete('/properties')).status).toBe(307);
    expect(proxy(requete('/properties')).status).not.toBe(308);
  });
});

describe('AC5 — un choix explicite n’est jamais écrasé', () => {
  it('une URL déjà préfixée n’est PAS redirigée, même sous un Accept-Language contradictoire', () => {
    const r = proxy(
      requete('/en/properties/x', { entetes: { 'accept-language': 'fr-FR,fr;q=0.9' } }),
    );
    expect(r.status).toBe(200);
    expect(r.headers.get('location')).toBeNull();
  });

  it('sur une URL sans préfixe, le cookie l’emporte sur Accept-Language', () => {
    const r = proxy(
      requete('/properties/x', {
        cookies: { [LOCALE_COOKIE_NAME]: 'wo' },
        entetes: { 'accept-language': 'fr-FR,fr;q=0.9' },
      }),
    );
    expect(cheminDe(r.headers.get('location')!)).toBe('/wo/properties/x');
  });

  it('sans cookie, Accept-Language décide', () => {
    const r = proxy(requete('/properties/x', { entetes: { 'accept-language': 'en-US,en;q=0.9' } }));
    expect(cheminDe(r.headers.get('location')!)).toBe('/en/properties/x');
  });
});

describe('la langue traverse jusqu’au serveur', () => {
  it('pose l’en-tête que `getRequestConfig({ requestLocale })` lit', () => {
    const r = proxy(requete('/wo/properties/x'));
    // ⚠ Sur la RÊQUETE réécrite, pas sur la réponse : c'est ce que `NextResponse.next({ request })`
    // renvoie à Next. Sans cet en-tête, `/wo/…` se rendrait dans la langue du cookie.
    expect(r.headers.get('x-middleware-override-headers')).toContain(
      ENTETE_LOCALE_NEXT_INTL.toLowerCase(),
    );
    expect(r.headers.get(`x-middleware-request-${ENTETE_LOCALE_NEXT_INTL.toLowerCase()}`)).toBe('wo');
  });
});

describe('l’URL propage son choix au cookie — sinon la langue est perdue au premier clic', () => {
  it('pose NEXT_LOCALE quand le visiteur arrive sur une URL de langue sans cookie', () => {
    // Le cas du lien PARTAGÉ, qui est l'objectif utilisateur du ticket : le destinataire n'a aucun
    // cookie. Sans ce report, son premier clic sur un `href` non préfixé — l'immense majorité des
    // liens du produit — le renverrait en français.
    const r = proxy(requete('/en/properties/x'));
    const pose = r.cookies.get(LOCALE_COOKIE_NAME);
    expect(pose?.value).toBe('en');
    expect(pose?.path).toBe('/');
  });

  it('corrige un cookie qui contredit l’URL — l’URL gagne, ADR-0026 §5', () => {
    const r = proxy(requete('/wo/properties/x', { cookies: { [LOCALE_COOKIE_NAME]: 'fr' } }));
    expect(r.cookies.get(LOCALE_COOKIE_NAME)?.value).toBe('wo');
  });

  it('n’écrit rien quand le cookie dit déjà la même chose', () => {
    const r = proxy(requete('/en/properties/x', { cookies: { [LOCALE_COOKIE_NAME]: 'en' } }));
    expect(r.cookies.get(LOCALE_COOKIE_NAME)).toBeUndefined();
  });

  it('une fois le cookie posé, un lien non préfixé mène à la BONNE langue', () => {
    // La chaîne complète, en deux temps — c'est elle qui porte l'objectif, pas chaque moitié.
    const arrivee = proxy(requete('/en/properties/x'));
    const cookie = arrivee.cookies.get(LOCALE_COOKIE_NAME)!.value;
    const clic = proxy(requete('/properties/y', { cookies: { [LOCALE_COOKIE_NAME]: cookie } }));
    expect(cheminDe(clic.headers.get('location')!)).toBe('/en/properties/y');
  });
});

describe('les surfaces non localisées gardent leurs URL — ADR-0026 §2', () => {
  it('la console n’est jamais redirigée pour une histoire de langue', () => {
    const r = proxy(requete('/app/overview', { cookies: { [AUTH_COOKIE_NAME]: 'jeton' } }));
    expect(r.status).toBe(200);
    expect(r.headers.get('location')).toBeNull();
  });

  it('le BFF n’est jamais préfixé — c’est le mode de défaillance le plus large', () => {
    for (const chemin of ['/api/auth/me', '/api/me/profiles', '/api/export/properties']) {
      const r = proxy(requete(chemin));
      expect(r.status, chemin).toBe(200);
      expect(r.headers.get('location'), chemin).toBeNull();
    }
  });

  it('le `matcher` exclut lui aussi /api — deux barrières, pas une', () => {
    // Ancré, comme Next l'ancre : il passe le `matcher` par `tryToParsePath` (path-to-regexp),
    // qui produit un motif ancré. Un test non ancré passerait sur `/api/auth/me` en trouvant une
    // correspondance partielle, et affirmerait le contraire de ce qui se produit.
    const motif = new RegExp(`^${config.matcher[0]!}$`);
    expect(motif.test('/api/auth/me')).toBe(false);
    expect(motif.test('/robots.txt')).toBe(false);
    expect(motif.test('/_next/static/chunk.js')).toBe(false);
    expect(motif.test('/properties/x')).toBe(true);
    expect(motif.test('/fr/properties/x')).toBe(true);
  });

  it('l’export de configuration s’appelle `config` — Next ne lit rien d’autre', () => {
    // `proxyConfig` était le nom précédent, et Next ne l'a jamais lu : le `matcher` n'a jamais été
    // appliqué. Mesuré dans `next/dist/build/analysis/get-page-static-info.js`
    // (`extractExportedConstValue(ast, 'config')`), et par exécution sur un `next dev`.
    expect(config).toBeDefined();
    expect(Array.isArray(config.matcher)).toBe(true);
  });
});

describe('la garde d’authentification est intacte', () => {
  it('/app sans jeton part vers la connexion, avec son chemin de retour', () => {
    const r = proxy(requete('/app/overview'));
    expect(r.status).toBe(307);
    const url = new URL(r.headers.get('location')!, 'https://www.takussan.com');
    expect(url.pathname).toBe('/auth/login');
    expect(url.searchParams.get('redirect')).toBe('/app/overview');
  });

  it('/admin sans jeton aussi', () => {
    const r = proxy(requete('/admin/users'));
    expect(cheminDe(r.headers.get('location')!)).toBe('/auth/login');
  });

  it('/auth avec un jeton revient sur la console', () => {
    const r = proxy(requete('/auth/login', { cookies: { [AUTH_COOKIE_NAME]: 'jeton' } }));
    expect(cheminDe(r.headers.get('location')!)).toBe('/app');
  });

  it('/auth sans jeton passe, et n’est pas préfixé d’une langue', () => {
    const r = proxy(requete('/auth/login'));
    expect(r.status).toBe(200);
    expect(r.headers.get('location')).toBeNull();
  });
});
