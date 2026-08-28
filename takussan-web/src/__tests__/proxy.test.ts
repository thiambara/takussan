import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { LOCALE_COOKIE_NAME, LOCALES } from '@/i18n/config';
import { SEGMENTS_NON_LOCALISES, estCheminLocalisable } from '@/i18n/routing';
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

  it('/verification-indisponible garde son URL — c’est la page de secours des gardes fail-closed', () => {
    // ⚠️ Ce test rougissait. `verification-indisponible` vit dans le groupe `(dashboard)`, donc à la
    // RACINE du chemin, et manquait de `SEGMENTS_NON_LOCALISES` : le proxy la redirigeait vers
    // `/fr/verification-indisponible`, qui n’est pas une route — 404.
    //
    // Ce qui rend le défaut coûteux, c’est QUELLE page c’est : `server-guards.ts` y redirige quand
    // il n’a pas PU vérifier les accès, c’est-à-dire quand l’API est en panne. Un utilisateur qui
    // subissait une panne recevait « nous n’avons pas pu vérifier vos accès » ; il recevait
    // désormais un 404. Le correctif d’une panne remplacé, en silence, par une autre panne.
    const r = proxy(requete('/verification-indisponible', { cookies: { [AUTH_COOKIE_NAME]: 'jeton' } }));
    expect(r.status).toBe(200);
    expect(r.headers.get('location')).toBeNull();
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

  it('TOUT chemin localisable passe le `matcher` — invariant, sur un balayage ENGENDRÉ', () => {
    // ── L'INVARIANT, et pourquoi ce n'est pas « les deux disent la même chose » ──────────────────
    //
    // Les deux barrières ne répondent pas à la même question. Le `matcher` décide si le proxy
    // S'EXÉCUTE ; `estCheminLocalisable` décide s'il REDIRIGE. L'implication ne va donc que dans un
    // sens, et c'est celle-là qui est load-bearing :
    //
    //     estCheminLocalisable(c) ⟹ le `matcher` laisse passer c
    //
    // Sa violation est un 404 : un chemin public que le proxy ne voit pas n'est pas redirigé, et il
    // n'existe plus aucune route publique sans préfixe pour le servir.
    //
    // La réciproque est FAUSSE et doit l'être : `/app/overview` passe le `matcher` sans être
    // localisable — le proxy doit le voir pour la garde d'authentification.
    //
    // ⚠️ Ce test s'intitulait « disent EXACTEMENT la même chose » et parcourait DIX chemins écrits à
    // la main. Un titre qui promet un universel sur un échantillon est un faux ami : il a laissé
    // passer `api` non ancré (`/apiary`, `/api-docs` exclus du `matcher`, jugés localisables ici).
    // Le balayage est donc ENGENDRÉ — et sa famille la plus utile est celle des sosies de préfixe,
    // celle qu'aucune liste écrite à la main ne pense à contenir.
    const motif = new RegExp(`^${config.matcher[0]!}$`);

    const chemins = [
      '/', '/properties', '/properties/mon-slug', '/agencies/x', '/agents/y', '/compare',
      '/properties/villa-2.5-pieces',                  // point DANS le slug
      '/properties/mon-slug?filter[city]=Dakar',
      ...LOCALES.flatMap((l) => [`/${l}`, `/${l}/properties`, `/${l}/properties/mon-slug`]),
      // ── Les SOSIES DE PRÉFIXE : pour chaque surface réservée, un segment qui COMMENCE par elle
      //    sans être elle. `estCheminLocalisable` ne confond pas un préfixe avec un segment ; le
      //    `matcher` le confondait. C'est la famille qui attrape ce défaut, et elle est engendrée
      //    depuis la constante — donc elle grandit toute seule.
      ...SEGMENTS_NON_LOCALISES.flatMap((s) => [`/${s}ary`, `/${s}-docs`, `/${s}s`, `/${s}ing/x`]),
      // Les sosies des surfaces de la garde d'AUTHENTIFICATION, pas seulement du `matcher` :
      // `/apple-icon` a été happé par `startsWith('/app')` en vrai, mesuré sur serveur.
      '/appartements', '/application/x', '/administration', '/authentique', '/authors/x',
    ];

    const violations = chemins.filter((c) => estCheminLocalisable(c.split('?')[0]!) && !motif.test(c.split('?')[0]!));
    expect(
      violations,
      `Ces chemins sont LOCALISABLES mais exclus du \`matcher\` : ${violations.join(', ')}.\n` +
        `    Le proxy ne les voit donc pas, ne les redirige pas, et il n’existe plus de route\n` +
        `    publique sans préfixe pour les servir : ils rendent 404.`,
    ).toEqual([]);

    // Refus de vacuité : un balayage qui ne contiendrait aucun chemin localisable serait vert sans
    // rien avoir éprouvé.
    expect(chemins.filter((c) => estCheminLocalisable(c.split('?')[0]!)).length).toBeGreaterThan(20);
  });

  it('le `matcher` exclut bien ce qu’il doit exclure — l’autre sens, sur les cas réels', () => {
    const motif = new RegExp(`^${config.matcher[0]!}$`);
    for (const chemin of ['/api', '/api/auth/me', '/robots.txt', '/sitemap.xml', '/favicon.ico', '/_next/static/c.js']) {
      expect(motif.test(chemin), `${chemin} devrait être exclu du matcher`).toBe(false);
      expect(estCheminLocalisable(chemin), `${chemin} ne devrait pas être localisable`).toBe(false);
    }
  });

  it('l’export de configuration s’appelle `config` — Next ne lit rien d’autre', () => {
    // `proxyConfig` était le nom précédent, et Next ne l'a jamais lu : le `matcher` n'a jamais été
    // appliqué. Mesuré dans `next/dist/build/analysis/get-page-static-info.js`
    // (`extractExportedConstValue(ast, 'config')`), et par exécution sur un `next dev`.
    expect(config).toBeDefined();
    expect(Array.isArray(config.matcher)).toBe(true);
  });
});

describe('les fichiers de métadonnées de Next gardent leur URL racine', () => {
  it('/icon, /opengraph-image, /twitter-image ne sont jamais redirigés', () => {
    // Servis par `src/app/icon.tsx` & co, à la racine, SANS extension. Mesuré sur `next dev` proxy
    // neutralisé : `/icon` → 200 image/png. Redirigés vers `/fr/icon`, ils rendaient 404 —
    // l'icône du site et l'image de partage social cessaient d'être servies.
    for (const chemin of ['/icon', '/apple-icon', '/opengraph-image', '/twitter-image']) {
      const r = proxy(requete(chemin));
      expect(r.status, chemin).toBe(200);
      expect(r.headers.get('location'), chemin).toBeNull();
    }
  });

  it('le suffixe numérique est couvert — Next sert /icon1, pas /icon/1', () => {
    // Mesuré : `icon1.tsx` sert `/icon1` (200) ; `/icon/1` rend 404. Le suffixe est OUVERT, d'où
    // une règle de forme plutôt qu'une liste.
    for (const chemin of ['/icon1', '/icon2', '/opengraph-image1', '/twitter-image3']) {
      expect(proxy(requete(chemin)).headers.get('location'), chemin).toBeNull();
    }
  });

  it('mais /manifest.webmanifest, /sitemap.xml et /robots.txt le sont par leur EXTENSION', () => {
    // Mesuré : `manifest.ts` sert `/manifest.webmanifest` (200), pas `/manifest`. Réserver
    // `manifest` comme segment réserverait une URL qu'aucune route ne sert.
    for (const chemin of ['/manifest.webmanifest', '/sitemap.xml', '/robots.txt']) {
      expect(proxy(requete(chemin)).headers.get('location'), chemin).toBeNull();
    }
    expect(estCheminLocalisable('/manifest')).toBe(true);
  });
});

describe('la garde d’authentification est ANCRÉE sur une frontière de segment', () => {
  it('les sosies de /app, /admin et /auth ne sont pas happés par la console', () => {
    // ⚠️ Mesuré AVANT correctif : `/apple-icon` rendait 307 vers
    // `/auth/login?redirect=%2Fapple-icon` — la garde d'authentification, pas la redirection de
    // langue. `pathname.startsWith('/app')` confond un préfixe et un segment, la MÊME faute que le
    // `matcher` et que l'exclusion des fichiers. Trois fois dans un seul fichier.
    for (const chemin of ['/apple-icon', '/appartements', '/application/x', '/admins', '/administration', '/authentique', '/authors/x']) {
      const location = proxy(requete(chemin)).headers.get('location');
      expect(location ?? '', `${chemin} ne doit pas partir sur la connexion`).not.toContain('/auth/login');
    }
  });

  it('mais /app, /admin et /auth EUX-MÊMES le sont toujours — nus comme suivis d’un segment', () => {
    // L'ancrage ne doit pas relâcher la garde : c'est l'autre moitié, et c'est celle qu'un
    // correctif d'ancrage rate quand il oublie le `$`.
    for (const chemin of ['/app', '/app/overview', '/admin', '/admin/users']) {
      const url = proxy(requete(chemin)).headers.get('location');
      expect(url, chemin).toContain('/auth/login');
    }
    for (const chemin of ['/auth', '/auth/login']) {
      const url = proxy(requete(chemin, { cookies: { [AUTH_COOKIE_NAME]: 'jeton' } })).headers.get('location');
      expect(cheminDe(url!), chemin).toBe('/app');
    }
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
