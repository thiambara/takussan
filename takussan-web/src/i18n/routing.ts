import { DEFAULT_LOCALE, LOCALES, isLocale, type Locale } from './config';

/**
 * Le schéma d'URL de la langue — [ADR-0026](../../../docs/adr/0026-la-langue-est-un-segment-d-url-sur-la-surface-publique.md).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, EN UNE PHRASE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * La langue est le PREMIER segment du chemin, elle y est TOUJOURS présente (le français compris),
 * et elle ne l'est QUE sur la surface publique.
 *
 *   /fr/properties/<slug>      ✓ la surface publique, préfixée sans exception
 *   /app/overview              ✓ la console, jamais préfixée
 *   /api/me/profiles           ✓ le BFF, jamais préfixé — c'est le mode de défaillance le plus large
 *   /properties/<slug>         → 307 vers /<locale>/properties/<slug>  (cf. `src/proxy.ts`)
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE NE CONTIENT QUE DES FONCTIONS PURES
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Les trois surfaces qui doivent s'accorder sur ce schéma ne partagent aucun environnement
 * d'exécution : le proxy tourne sur le runtime edge, `request.ts` sur le serveur, le `Link` de
 * `navigation.ts` dans le navigateur. Une règle recopiée trois fois est une règle qui diverge deux
 * fois. Elle est donc écrite ici, sans `next/*`, sans état, et éprouvée seule
 * (`__tests__/routing.test.ts`).
 */

/**
 * Les premiers segments qui NE PORTENT JAMAIS de langue.
 *
 * ⚠️ **Un oubli dans cette liste N'EST PAS bénin, et la première version de ce commentaire
 * prétendait le contraire.** Elle affirmait qu'« au pire » un oubli produit « une redirection en
 * trop sur une surface interne, qui se voit tout de suite ». C'est faux, et ça a coûté :
 * `verification-indisponible` manquait, le proxy la jugeait donc localisable et la redirigeait vers
 * `/fr/verification-indisponible`, **qui n'est pas une route — donc 404**. Un segment absent d'ici
 * ne perd pas un aller-retour : il perd son URL.
 *
 * Et *quelle* page c'était aggrave le cas : la page de secours des gardes fail-closed
 * (`src/lib/access/server-guards.ts`, `redirect(ROUTE_VERIF_INDISPONIBLE)`), qu'on n'atteint que
 * lorsque l'API ne répond plus. Le correctif d'une panne avait été remplacé, en silence, par une
 * autre panne — et sur le seul chemin qui existe pour distinguer « je n'ai pas pu demander » de
 * « non ».
 *
 * **Cette liste est écrite à la main parce qu'elle DOIT l'être** : `src/proxy.ts` s'exécute sur le
 * runtime edge, où il n'y a pas de système de fichiers à interroger. Ce qui peut être dérivé l'est
 * donc ailleurs : `src/i18n/__tests__/routing.test.ts` **énumère les segments de premier niveau
 * réellement présents sous `src/app`** — groupes de routes dépliés — et exige que chacun figure
 * ici. *Aucune liste maintenue à la main ne reste juste ; seule une liste dérivée le reste* — quand
 * on ne peut pas dériver la liste, on dérive sa vérification.
 *
 * Elle reste la définition **négative** de la surface publique : tout ce qui n'y est pas est
 * localisable. L'inverse — énumérer les routes publiques — déplacerait l'oubli sur la page publique
 * neuve, servie sur une URL sans langue, c'est-à-dire le défaut que TCK-434 corrige.
 *
 * `api` en tête, et pour une raison propre : un route handler BFF préfixé d'une langue est un 404
 * pour TOUT le produit, console comprise. Il est aussi exclu du `matcher` de `src/proxy.ts` — deux
 * barrières, parce qu'une seule ne survivrait pas à une réécriture du `matcher`.
 */
export const SEGMENTS_NON_LOCALISES: readonly string[] = [
  'api',
  'app',
  'admin',
  'super-admin',
  'auth',
  'onboarding',
  'publish',
  'maintenance',
  // ⚠ Vit dans le groupe `(dashboard)`, donc à la RACINE du chemin — c'est le segment que la
  // première version de cette liste a oublié. Cf. l'en-tête.
  'verification-indisponible',
  // Servis par la plateforme, pas par `src/app` : la garde dérivée ne peut pas les voir, et ne
  // cherche pas à les voir.
  '_next',
  '_vercel',
];

/**
 * Les FICHIERS DE MÉTADONNÉES de Next servis sur une URL RACINE et SANS EXTENSION.
 *
 * ⚠️ **Une troisième perte d'URL de la même famille, et celle-ci n'est pas un répertoire.**
 * `src/app/icon.tsx`, `apple-icon.tsx`, `opengraph-image.tsx`, `twitter-image.tsx` sont des
 * CONVENTIONS de Next : il les sert à la racine, sans extension. Mesuré le 2026-08-27 sur
 * `next dev` (proxy neutralisé, pour voir le routeur et non la redirection) :
 *
 *     /icon             → 200 image/png
 *     /icon1            → 200 image/png      ← le suffixe numérique sert `/icon1`, PAS `/icon/1`
 *     /icon/1           → 404
 *     /opengraph-image  → 200 image/png
 *
 * Sans extension et absents de {@link SEGMENTS_NON_LOCALISES}, ils étaient jugés localisables et
 * redirigés vers `/fr/icon`, `/fr/opengraph-image` — **404**. L'icône du site et l'image de partage
 * social cessaient d'être servies.
 *
 * **C'est une RÈGLE DE FORME et non une liste**, parce que le suffixe numérique est ouvert : Next
 * accepte `icon1`, `icon2`, … et aucune liste écrite à la main ne les contient tous.
 *
 * Ce qui n'est PAS ici, et pourquoi — mesuré, pas déduit : `manifest.ts` sert
 * `/manifest.webmanifest` (200), `sitemap.ts` sert `/sitemap.xml`, `robots.ts` sert `/robots.txt`.
 * Ils portent une extension, donc la règle du dernier segment les couvre déjà. Les ajouter ici
 * réserverait des segments (`/manifest`) qu'aucune route ne sert.
 */
const MOTIF_METADONNEES_NEXT = /^(?:icon|apple-icon|opengraph-image|twitter-image)\d*$/;

/** Le premier segment d'un chemin, sans son slash. `'/'` rend `''`. */
function premierSegment(pathname: string): string {
  return pathname.replace(/^\/+/, '').split('/')[0] ?? '';
}

/**
 * Un chemin appartient-il à la surface publique localisée ?
 *
 * Rend `false` pour les surfaces de {@link SEGMENTS_NON_LOCALISES} et pour tout chemin portant une
 * extension de fichier (`/robots.txt`, `/sitemap.xml`, `/favicon.ico`, `/og-image.png`) : ces
 * ressources sont servies telles quelles et n'ont pas de version par langue.
 */
export function estCheminLocalisable(pathname: string): boolean {
  if (!pathname.startsWith('/')) return false;
  const segment = premierSegment(pathname);
  if (SEGMENTS_NON_LOCALISES.includes(segment)) return false;
  // Les conventions de fichiers de Next, servies à la racine sans extension. Cf. l'en-tête de
  // MOTIF_METADONNEES_NEXT : une règle de forme, parce que le suffixe numérique est ouvert.
  if (MOTIF_METADONNEES_NEXT.test(segment)) return false;
  // Une extension sur le DERNIER segment seulement : un slug peut légitimement contenir un point,
  // un fichier servi tel quel ne le peut pas ailleurs qu'à la fin.
  //
  // ⚠ Le `matcher` de `src/proxy.ts` doit dire EXACTEMENT la même chose, et il disait autre chose :
  // son `.*\..*` excluait tout chemin portant un point OÙ QUE CE SOIT. Un slug contenant un point
  // était donc jugé localisable ici et jamais vu par le proxy là-bas — un commentaire qui promet
  // une tolérance que le système n'offre pas. Les deux sont accordés depuis (TCK-434, revue) ;
  // `src/__tests__/proxy.test.ts` les compare sur les mêmes chemins.
  const dernier = pathname.split('/').pop() ?? '';
  if (/\.[a-z0-9]+$/i.test(dernier)) return false;
  return true;
}

/**
 * Sépare un chemin en (langue, reste). La langue est `null` si le premier segment n'en est pas une.
 *
 * `/en/properties/x` → `{ locale: 'en', chemin: '/properties/x' }`
 * `/properties/x`    → `{ locale: null, chemin: '/properties/x' }`
 * `/fr`              → `{ locale: 'fr', chemin: '/' }`
 */
export function decouperLocale(pathname: string): { locale: Locale | null; chemin: string } {
  const segment = premierSegment(pathname);
  if (!isLocale(segment)) return { locale: null, chemin: pathname };
  const reste = pathname.slice(segment.length + 1);
  return { locale: segment, chemin: reste === '' ? '/' : reste };
}

/**
 * Le chemin `pathname` servi dans la langue `locale`.
 *
 * Idempotent et RÉÉCRIVANT : un chemin qui porte déjà une langue voit la sienne remplacée, ce dont
 * dépend le commutateur de langue. Un chemin non localisable est rendu tel quel — c'est ce qui rend
 * ce helper posable sans discernement sur un `href` quelconque (cf. `navigation.ts`).
 */
export function cheminLocalise(pathname: string, locale: Locale): string {
  if (!estCheminLocalisable(pathname)) return pathname;
  const { chemin } = decouperLocale(pathname);
  return chemin === '/' ? `/${locale}` : `/${locale}${chemin}`;
}

/**
 * Parse un `Accept-Language` en étiquettes primaires triées par préférence (q décroissant).
 *
 * Gère `fr;q=0.1, en;q=0.9`, où la PREMIÈRE citée n'est pas la préférée. Un facteur q malformé
 * garde le défaut RFC 7231 de 1.0. Rend des sous-étiquettes primaires minuscules (`fr` pour `fr-CA`).
 */
export function analyserAcceptLanguage(header: string): string[] {
  return header
    .split(',')
    .map((item) => {
      const [rawTag, ...params] = item.split(';');
      const tag = rawTag?.trim().split('-')[0]?.toLowerCase();
      if (!tag) return null;
      let q = 1.0;
      for (const param of params) {
        const match = param.trim().match(/^q=([0-9.]+)$/i);
        if (match) {
          const parsed = Number.parseFloat(match[1]!);
          if (Number.isFinite(parsed)) q = parsed;
          break;
        }
      }
      return { tag, q };
    })
    .filter((entry): entry is { tag: string; q: number } => entry !== null)
    .sort((a, b) => b.q - a.q)
    .map((entry) => entry.tag);
}

/**
 * La langue vers laquelle envoyer une requête qui n'en porte PAS dans son URL.
 *
 * ⚠ Ce n'est PAS la préséance de rendu. ADR-0026 §5 en distingue deux, et les confondre est
 * l'erreur à éviter :
 *
 * · **quelle langue rendre** sur une URL préfixée → le préfixe, SEUL. Ni cookie ni en-tête ne
 *   peuvent le contredire, c'est ce qui fait qu'un choix explicite survit.
 * · **où envoyer** une requête sans préfixe → cookie → `Accept-Language` → `fr`. C'est cette
 *   fonction-ci.
 */
export function localeDeRepli(
  cookieLocale: string | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  if (isLocale(cookieLocale)) return cookieLocale;
  if (acceptLanguage) {
    for (const candidat of analyserAcceptLanguage(acceptLanguage)) {
      if (isLocale(candidat)) return candidat;
    }
  }
  return DEFAULT_LOCALE;
}

/** Les langues déclarées indexables — les trois. ADR-0026 §4 : `wo` n'a pas de régime d'exception. */
export const LOCALES_INDEXABLES: readonly Locale[] = LOCALES;
