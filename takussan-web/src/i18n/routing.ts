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
 * ⚠ Cette liste est la définition **négative** de la surface publique : tout ce qui n'y est pas est
 * localisable. C'est délibéré — l'inverse (énumérer les routes publiques) obligerait à mettre cette
 * liste à jour à chaque page ajoutée, et l'oubli produirait une page publique servie sur une URL
 * sans langue, c'est-à-dire le défaut que TCK-434 corrige. Ici, l'oubli produit au pire une
 * redirection en trop sur une surface interne, qui se voit tout de suite.
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
  '_next',
  '_vercel',
];

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
  // Une extension sur le DERNIER segment seulement : un slug peut légitimement contenir un point,
  // un fichier servi tel quel ne le peut pas ailleurs qu'à la fin.
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
