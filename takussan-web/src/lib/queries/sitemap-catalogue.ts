import { apiFetch } from '@/lib/api';
import { DEFAULT_LOCALE } from '@/i18n/config';

/**
 * L'énumération du catalogue public pour le sitemap — TCK-431.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN ENDPOINT DÉDIÉ PLUTÔT QUE `/public/properties`
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le ticket désigne `GET /api/public/properties` comme source. Re-mesuré le 2026-08-27, il ne peut
 * pas l'être :
 *
 * · il rend un `PropertyResource` complet — 47 clés, plus `address` et `media` chargés en relation
 *   — quand un sitemap n'a besoin que de `slug` et `updated_at` ;
 * · il n'accepte AUCUN `fields[properties]` : `PublicPropertyController::index()` n'est pas bâti
 *   sur `spatie/laravel-query-builder`, c'est un `Property::query()` nu ;
 * · son `per_page` n'est plafonné par rien (`paginate((int) $request->input('per_page', 20))`).
 *
 * Énumérer 50 000 fiches par cette route reviendrait à télécharger le catalogue entier, médias
 * compris, pour en extraire deux colonnes. `GET /api/public/properties/sitemap` a donc été ajouté,
 * plafonné à {@link TAILLE_DE_PAGE_SITEMAP} par page côté serveur.
 */

export type BienDuSitemap = {
  readonly slug: string;
  /** ISO 8601 — `BaseResource::iso()` côté API (ADR-0018). */
  readonly updated_at: string | null;
};

type ReponseSitemap = {
  readonly data: readonly BienDuSitemap[];
  readonly meta: {
    readonly total: number;
    readonly per_page: number;
    readonly current_page: number;
    readonly last_page: number;
  };
};

/** Le plafond du serveur (`PublicPropertyController::SITEMAP_MAX_PER_PAGE`). */
export const TAILLE_DE_PAGE_SITEMAP = 1000;

/**
 * Garde-fou anti-emballement, **volontairement au-DESSUS de la limite du protocole**.
 *
 * 64 pages = 64 000 fiches, soit 192 000 `<url>` : bien plus que les 50 000 que
 * `construireSitemap` refuse déjà. Ce plafond-ci ne peut donc se déclencher que sur une API qui
 * rend un `last_page` absurde — jamais sur une croissance normale du catalogue, dont la limite
 * réelle est signalée ailleurs et avec le bon message. *Deux plafonds qui se déclenchent dans le
 * même ordre de grandeur, c'est un seul plafond et un message trompeur.*
 */
export const PAGES_MAX_SITEMAP = 64;

/**
 * Toutes les fiches publiquement indexables, page après page.
 *
 * **Elle LÈVE** en cas de panne — c'est l'appelant (`src/app/sitemap.ts`) qui décide de dégrader,
 * et il le fait bruyamment. Avaler l'erreur ici rendrait un tableau vide indistinguable d'un
 * catalogue vide, c'est-à-dire un sitemap valide et faux.
 */
export async function listerBiensDuSitemap(): Promise<readonly BienDuSitemap[]> {
  const biens: BienDuSitemap[] = [];
  let page = 1;
  let dernierePage = 1;

  do {
    const reponse = await apiFetch<ReponseSitemap>(
      `/public/properties/sitemap?page=${page}&per_page=${TAILLE_DE_PAGE_SITEMAP}`,
      undefined,
      // Le catalogue du sitemap ne porte aucun libellé traduit — `slug` et `updated_at` sont les
      // mêmes dans les trois langues. La locale est passée quand même : `apiFetch` la devine
      // sinon depuis `document.cookie`, qui n'existe pas côté serveur.
      { locale: DEFAULT_LOCALE },
    );

    biens.push(...reponse.data);
    dernierePage = reponse.meta.last_page;

    if (dernierePage > PAGES_MAX_SITEMAP) {
      throw new Error(
        `/public/properties/sitemap annonce ${dernierePage} pages (plafond ${PAGES_MAX_SITEMAP}). ` +
          `À ${TAILLE_DE_PAGE_SITEMAP} fiches par page, c'est bien au-delà de ce qu'un fichier de ` +
          `sitemap peut porter : la réponse est incohérente, ou la pagination est cassée.`,
      );
    }

    page += 1;
  } while (page <= dernierePage);

  return biens;
}
