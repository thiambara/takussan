import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { LOCALE_COOKIE_MAX_AGE, LOCALE_COOKIE_NAME } from '@/i18n/config';
import { cheminLocalise, decouperLocale, estCheminLocalisable, localeDeRepli } from '@/i18n/routing';
import { NextRequest, NextResponse } from 'next/server';

/**
 * L'en-tête par lequel next-intl transporte la langue du serveur de routage jusqu'à
 * `getRequestConfig({ requestLocale })` (`next-intl/dist/…/shared/constants.js` :
 * `HEADER_LOCALE_NAME`).
 *
 * ⚠ C'est une constante INTERNE de next-intl, que le paquet n'exporte pas. Elle est donc recopiée
 * ici — et `src/i18n/__tests__/entete-locale-next-intl.test.ts` la relit dans `node_modules` à
 * chaque exécution. Sans cette garde, une montée de version qui la renommerait ne casserait rien de
 * visible : la langue retomberait simplement sur le cookie, et `/en/properties/x` se remettrait à
 * rendre du français — le défaut d'origine, restauré en silence par une mise à jour de routine.
 */
export const ENTETE_LOCALE_NEXT_INTL = 'X-NEXT-INTL-LOCALE';

/**
 * Le garde de route de Next 16 — `proxy.ts` est le nouveau nom de `middleware.ts`.
 *
 * Il porte deux règles qui n'ont rien à voir l'une avec l'autre et qui doivent pourtant tenir dans
 * le même fichier, parce que Next n'en exécute qu'un :
 *
 *   1. la garde d'authentification (`/app`, `/admin` exigent un jeton ; `/auth` le refuse) ;
 *   2. le schéma d'URL de la langue ([ADR-0026](../../docs/adr/0026-la-langue-est-un-segment-d-url-sur-la-surface-publique.md)).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * ⚠️ L'EXPORT DE CONFIGURATION S'APPELLE `config`, ET RIEN D'AUTRE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Ce fichier exportait `proxyConfig`, avec un `matcher` restreint à `/app`, `/admin`, `/auth`. Next
 * **ne le lisait pas** : il n'extrait la configuration que d'un export nommé `config`
 * (`node_modules/next/dist/build/analysis/get-page-static-info.js` :
 * `extractExportedConstValue(ast, 'config')` ; `proxyConfig` n'apparaît nulle part dans le paquet).
 *
 * Le proxy tournait donc sur TOUT. Mesuré le 2026-08-27 en l'instrumentant d'un en-tête et en
 * interrogeant un `next dev` :
 *
 *     /             → 200  x-mesure-proxy: /
 *     /properties   → 200  x-mesure-proxy: /properties
 *     /api/auth/me  → 401  x-mesure-proxy: /api/auth/me
 *     /favicon.ico  → 200  x-mesure-proxy: /favicon.ico
 *
 * *Un `matcher` qu'aucun outil ne lit n'est pas une restriction, c'est une croyance* — et TCK-434 a
 * failli être écrit sur elle : son énoncé conclut du `matcher` que « le proxy ne voit aucune route
 * publique ». Le nom est corrigé ici, ce qui rend le `matcher` réellement appliqué pour la première
 * fois : il EXCLUT désormais `/api`, les ressources internes de Next et les fichiers servis tels
 * quels — trois surfaces sur lesquelles ce fichier n'a rien à faire.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  // ⚠️ **ANCRÉ SUR UNE FRONTIÈRE DE SEGMENT, et ça n'a pas toujours été le cas.**
  //
  // Ces deux lignes s'écrivaient `pathname.startsWith('/app')` — donc `/apple-icon`,
  // `/appartements`, `/application` étaient traités comme la console. Mesuré : `/apple-icon`
  // (convention de fichier de Next, servie à la racine) rendait **307 vers
  // `/auth/login?redirect=%2Fapple-icon`**, alors même que la redirection de langue était
  // neutralisée. L'icône Apple du site public partait sur la page de connexion.
  //
  // C'est la MÊME faute que le `matcher` (`api` non ancré) et que l'exclusion des fichiers
  // (`.*\..*`) : *confondre un préfixe et un segment*. Trois fois dans ce fichier, sous trois
  // formes. Les trois sont ancrées, et le balayage engendré de `src/__tests__/proxy.test.ts`
  // éprouve les sosies de CHAQUE surface réservée — pas seulement ceux du `matcher`.
  const isAuthPath = /^\/auth(?:\/|$)/.test(pathname);
  const isAppPath = /^\/(?:app|admin)(?:\/|$)/.test(pathname);

  if (isAppPath && !token) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPath && token) {
    return NextResponse.redirect(new URL('/app', request.url));
  }

  // ── Le schéma d'URL de la langue ──────────────────────────────────────────────────────────────
  //
  // Ne concerne QUE la surface publique. La console et le BFF gardent leurs URL : ADR-0026 §2 le
  // dit explicitement plutôt que de le laisser déduire, parce qu'une surface « oubliée » et une
  // surface « délibérément exclue » ont exactement la même tête dans un diff.
  if (!estCheminLocalisable(pathname)) return NextResponse.next();

  const { locale } = decouperLocale(pathname);

  // ⚠️ **Une URL qui porte déjà sa langue n'est JAMAIS redirigée.** C'est la ligne qui fait tenir
  // l'AC5 : suivre `/en/properties/x` avec un `Accept-Language: fr` rend de l'anglais, parce que
  // rien ici ne regarde l'en-tête quand le préfixe est là. Une détection qui pourrait écraser un
  // choix exprimé reproduirait le défaut que ce ticket corrige, un cran plus haut.
  if (locale) {
    // L'en-tête que `getRequestConfig({ requestLocale })` lit côté serveur — c'est exactement ce
    // que pose le middleware de next-intl, que ce dépôt n'utilise pas (son schéma suppose le site
    // ENTIER sous `[locale]` ; ici la console n'y est pas).
    //
    // ⚠ Il double délibérément le `setRequestLocale` du layout : `generateMetadata` d'une page peut
    // s'exécuter AVANT le corps du layout, et n'aurait alors aucune langue à lire. Le
    // `<title>`, le JSON-LD et le `hreflang` d'une fiche sortiraient en français sur `/en/…`.
    const entetes = new Headers(request.headers);
    entetes.set(ENTETE_LOCALE_NEXT_INTL, locale);
    const reponse = NextResponse.next({ request: { headers: entetes } });

    // ⚠️ **L'URL RECOPIE son choix dans le cookie, et sans cette ligne l'objectif du ticket ne
    // tient pas un clic.**
    //
    // Le cas : quelqu'un reçoit `/en/properties/x` et l'ouvre. Il n'a AUCUN cookie — il n'est
    // jamais passé par le commutateur. Il lit la fiche en anglais, clique une carte de bien dont
    // le `href` est `/properties/y` (l'immense majorité des liens du produit), et le repli
    // ci-dessous l'envoie sur `/fr/properties/y`. **La langue est perdue au premier clic**, et le
    // lien partagé n'aura servi qu'à une seule page.
    //
    // Suivre un lien dans une langue EST un choix explicite — c'est même le plus explicite qui
    // soit, ADR-0026 §5 le place au-dessus du cookie. Le recopier n'écrase donc pas un choix : il
    // en propage un. (Rien ici ne lit `Accept-Language` : l'interdit du ticket porte sur la
    // détection, pas sur l'URL.)
    //
    // C'est aussi ce qui rend la migration des ~50 fichiers portant un lien public facultative
    // plutôt que bloquante : un lien sans préfixe coûte un aller-retour, jamais la bonne langue.
    if (request.cookies.get(LOCALE_COOKIE_NAME)?.value !== locale) {
      reponse.cookies.set(LOCALE_COOKIE_NAME, locale, {
        maxAge: LOCALE_COOKIE_MAX_AGE,
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
    }

    return reponse;
  }

  const cible = localeDeRepli(
    request.cookies.get(LOCALE_COOKIE_NAME)?.value,
    request.headers.get('accept-language'),
  );

  const url = request.nextUrl.clone();
  url.pathname = cheminLocalise(pathname, cible);

  // ⚠️ **307 et non 308, et c'est le choix le plus contre-intuitif de l'ADR.** Un permanent
  // affirmerait que la cible est une propriété de l'URL SOURCE. Elle est une propriété du
  // DEMANDEUR : `/properties/x` doit mener à `/fr/…` pour l'un et `/en/…` pour l'autre. Mis en
  // cache par un navigateur ou un cache partagé, un 308 épinglerait la langue du premier visiteur
  // sur tous les suivants — le défaut corrigé, remonté d'une couche et rendu persistant.
  //
  // Le `Vary` dit au cache partagé ce dont la réponse dépend réellement. Sans lui, le calcul
  // ci-dessus n'aurait lieu que pour le premier demandeur.
  const reponse = NextResponse.redirect(url, 307);
  reponse.headers.set('Vary', 'Cookie, Accept-Language');
  return reponse;
}

/**
 * ⚠ Le nom `config` est LOAD-BEARING (cf. l'en-tête). Le renommer désactive silencieusement ce
 * `matcher` : rien ne rougit, le proxy se remet simplement à tourner sur `/api` et sur chaque
 * fichier statique.
 *
 * Ce qui est exclu, et pourquoi :
 * · `api(?:/|$)`       — un route handler BFF ne porte pas de langue et ne doit jamais en recevoir ;
 * · `_next(?:/|$)`     — les ressources du framework ;
 * · `.*\.[a-z0-9]+$`   — un chemin dont le DERNIER segment porte une extension (`robots.txt`,
 *                        `sitemap.xml`, `favicon.ico`).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE `matcher` A DIVERGÉ DEUX FOIS D'`estCheminLocalisable`, ET LES DEUX FOIS EN 404
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * *Quand deux barrières divergent, la question n'est jamais laquelle a raison, mais **quelle URL
 * tombe dans l'écart**.* Ici l'écart n'est jamais bénin : un chemin public exclu du `matcher` n'est
 * pas vu par le proxy, donc pas redirigé — et comme il n'existe plus aucune route publique sans
 * préfixe, il rend **404**.
 *
 * 1. L'exclusion des fichiers s'écrivait `.*\..*` — « un point N'IMPORTE OÙ », quand
 *    `estCheminLocalisable` ne regarde que le DERNIER segment. Mesuré sur serveur :
 *    `/properties/villa-2.5-pieces` rendait 404 ; ancrée, 307.
 * 2. `api` n'était pas ancré sur une frontière de segment : `/apiary`, `/api-docs`, `/apis` étaient
 *    exclus du `matcher` alors qu'`estCheminLocalisable` les juge localisables — il ne confond pas
 *    un préfixe avec un segment, et il a raison de ne pas les confondre.
 *
 * Aucune des deux n'était atteignable par une URL existante. C'est précisément ce qui les rendait
 * durables : *une divergence non atteignable ne se signale jamais ; elle attend la route qui la
 * rendra atteignable.* Les deux sont ancrées, et `src/__tests__/proxy.test.ts` ne les compare plus
 * sur une poignée de chemins écrits à la main : il éprouve l'invariant sur un balayage ENGENDRÉ,
 * dont une famille est faite exprès de sosies de préfixe (`apiary` pour `api`, `publishing` pour
 * `publish`…) — la famille qui a attrapé le point 2.
 */
export const config = {
  matcher: ['/((?!api(?:/|$)|_next(?:/|$)|.*\\.[a-z0-9]+$).*)'],
};
