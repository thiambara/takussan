import { apiFetch } from '@/lib/api';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';

/**
 * Les deux INDEX PUBLICS de profils — TCK-436.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI AUCUN `fields[…]` N'EST ENVOYÉ, ALORS QUE LA RÈGLE DU DÉPÔT L'EXIGE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * La règle des sparse fieldsets (`docs/spatie-query-builder.md`) existe pour que le front ne
 * télécharge pas des colonnes qu'il n'affiche pas. `GET /api/public/agencies` et
 * `GET /api/public/agents` sont bâtis à l'envers de ce contrat, et **plus strictement** : leur
 * projection est FIXE, décidée côté serveur, et un appelant ne peut pas l'élargir.
 *
 * · Ils n'appellent pas `Model::buildQuery()` — dont la liste blanche `$queryFields` est écrite
 *   pour la console et porte `email`, `phone`, `commission_rate` — mais `QueryBuilder::for()` avec
 *   une allowlist propre à la surface publique, et **sans `allowedFields()`**.
 * · La sortie est un tableau composé dans le contrôleur : douze clés pour une agence, quinze pour
 *   un agent, aucun champ de contact. Envoyer `fields[agencies]=…` serait un paramètre
 *   silencieusement IGNORÉ — c'est-à-dire une garantie décorative, la pire espèce.
 *
 * *Une projection qu'un client peut demander n'est pas une garantie ; une projection qu'il ne peut
 * pas élargir en est une.* Le raisonnement complet est dans le docblock de
 * `PublicAgencyController::index()`.
 *
 * ⚠ Le filtrage, lui, suit bien la règle : `filter[city]` et `filter[search]` sont appliqués côté
 * SERVEUR. Aucune page de ce ticket ne filtre une liste déjà récupérée.
 */

/** Une ligne d'index — la MÊME forme pour les deux ressources, à `agency`/`specialty` près. */
export type ProfilPublic = {
  readonly id: number;
  readonly slug: string;
  /** Le nom affiché : raison sociale pour une agence, nom complet pour un agent. */
  readonly nom: string;
  readonly logo_url: string | null;
  readonly is_verified: boolean;
  /** La ville où le profil publie le plus. `null` quand aucune annonce ne porte d'adresse. */
  readonly city: string | null;
  readonly cities: readonly string[];
  readonly portfolio_count: number;
  readonly rent_count: number;
  readonly sale_count: number;
  readonly reviews: { readonly average: number | null; readonly count: number };
  /** Agents seulement — l'enseigne sous laquelle leurs annonces sont publiées. */
  readonly agency?: { readonly slug: string; readonly name: string } | null;
  /** Agents seulement. */
  readonly specialty?: string | null;
};

export type PageDeProfils = {
  readonly profils: readonly ProfilPublic[];
  readonly page: number;
  readonly dernierePage: number;
  readonly total: number;
  /** La facette de ville, DÉRIVÉE du catalogue éligible par l'API — jamais composée ici. */
  readonly villes: readonly string[];
};

/** Les deux ressources, et le seul endroit où leurs chemins sont écrits. */
export const RESSOURCES_DE_PROFIL = {
  agencies: { chemin: '/agencies', api: '/public/agencies' },
  agents: { chemin: '/agents', api: '/public/agents' },
} as const;

export type RessourceDeProfil = keyof typeof RESSOURCES_DE_PROFIL;

/**
 * Le plafond du serveur (`IndexPublicProfilesRequest::PER_PAGE_MAX`).
 *
 * ⚠ Il est ÉCRIT ici parce qu'aucun endpoint ne le publie, et il est ÉPROUVÉ plutôt que cru :
 * `src/lib/queries/__tests__/public-profiles.test.ts` ne peut pas interroger l'API, mais le test
 * backend `test_ac1_per_page_est_plafonne_sur_les_deux_index` refuse `PER_PAGE_MAX + 1`. Une
 * valeur trop grande ici produirait donc un 422 visible, pas une page silencieusement tronquée.
 */
export const TAILLE_DE_PAGE_MAX = 48;

/** La taille d'une page d'index à l'écran. Trois colonnes × six rangées. */
export const TAILLE_DE_PAGE = 18;

type ReponseApi = {
  readonly data: readonly Record<string, unknown>[];
  readonly meta: {
    readonly total: number;
    readonly per_page: number;
    readonly current_page: number;
    readonly last_page: number;
    readonly cities?: readonly string[];
  };
};

/**
 * `data` de l'API → {@link ProfilPublic}, avec le seul renommage du module.
 *
 * L'API émet `name` pour une agence et `full_name` pour un agent — deux mots pour la même case de
 * la carte. Le renommage se fait ICI, une fois, plutôt que dans deux composants : *une carte qui
 * connaît la ressource qu'elle affiche est une carte qu'il faut dupliquer.*
 */
function versProfil(brut: Record<string, unknown>): ProfilPublic {
  const nom = typeof brut.full_name === 'string' && brut.full_name !== ''
    ? brut.full_name
    : String(brut.name ?? '');

  return {
    id: Number(brut.id),
    slug: String(brut.slug ?? ''),
    nom,
    logo_url: (brut.logo_url ?? brut.avatar_url ?? null) as string | null,
    is_verified: brut.is_verified === true,
    city: (brut.city ?? null) as string | null,
    cities: Array.isArray(brut.cities) ? (brut.cities as string[]) : [],
    portfolio_count: Number(brut.portfolio_count ?? 0),
    rent_count: Number(brut.rent_count ?? 0),
    sale_count: Number(brut.sale_count ?? 0),
    reviews: {
      average: (brut.reviews as { average?: number | null } | undefined)?.average ?? null,
      count: Number((brut.reviews as { count?: number } | undefined)?.count ?? 0),
    },
    agency: (brut.agency ?? null) as ProfilPublic['agency'],
    specialty: (brut.specialty ?? null) as string | null,
  };
}

/** Les paramètres qu'une page d'index transmet à l'API — filtrés côté SERVEUR, jamais ici. */
export type CriteresDIndex = {
  readonly page?: number;
  readonly ville?: string | undefined;
  readonly recherche?: string | undefined;
};

export function requeteDIndex(criteres: CriteresDIndex, perPage: number): string {
  const params = new URLSearchParams();
  params.set('per_page', String(Math.min(perPage, TAILLE_DE_PAGE_MAX)));
  if (criteres.page !== undefined && criteres.page > 1) params.set('page', String(criteres.page));
  if (criteres.ville) params.set('filter[city]', criteres.ville);
  if (criteres.recherche) params.set('filter[search]', criteres.recherche);
  return params.toString();
}

/**
 * Une page de l'index. **Elle LÈVE** en cas de panne de l'API.
 *
 * C'est l'appelant qui décide de dégrader, et la page le fait en distinguant l'ERREUR du VIDE —
 * la leçon de TCK-335 sur `/properties`, où les deux s'affichaient ensemble. Avaler l'erreur ici
 * rendrait un tableau vide indistinguable d'un catalogue vide, c'est-à-dire un « aucun résultat »
 * parfaitement faux.
 */
export async function listerProfilsPublics(
  ressource: RessourceDeProfil,
  criteres: CriteresDIndex,
  locale: Locale,
  perPage: number = TAILLE_DE_PAGE,
): Promise<PageDeProfils> {
  const reponse = await apiFetch<ReponseApi>(
    `${RESSOURCES_DE_PROFIL[ressource].api}?${requeteDIndex(criteres, perPage)}`,
    undefined,
    { locale },
  );

  return {
    profils: reponse.data.map(versProfil),
    page: reponse.meta.current_page,
    dernierePage: reponse.meta.last_page,
    total: reponse.meta.total,
    villes: reponse.meta.cities ?? [],
  };
}

/**
 * Garde-fou anti-emballement de l'énumération pour le sitemap, sur le patron de
 * `sitemap-catalogue.ts` : **volontairement au-DESSUS de la limite du protocole**.
 *
 * 200 pages × 48 profils = 9 600 profils, soit 28 800 `<url>` pour les trois langues — sous les
 * 50 000 que `construireSitemap` refuse déjà, mais du même ordre. Ce plafond-ci attrape une API
 * qui rendrait un `last_page` absurde, pas une croissance normale.
 */
export const PAGES_MAX_SITEMAP_PROFILS = 200;

/**
 * TOUS les profils éligibles, page après page — la source de sitemap de {@link RESSOURCES_DE_PROFIL}.
 *
 * ⚠ **L'éligibilité n'est pas re-décidée ici, et c'est le point.** AC6 demande que le sitemap
 * porte les profils éligibles *et aucun autre* ; réécrire la condition côté front la ferait
 * diverger de celle de l'index le jour où l'une des deux bouge, et un sitemap qui annonce des URL
 * rendant 404 est pire que pas de sitemap (même raisonnement que `PublicPropertyController::sitemap()`).
 * L'endpoint d'index EST l'énumération des éligibles : on le pagine, on ne le juge pas.
 *
 * ⚠ Il n'y a pas de `lastModified` sur ces entrées : l'index ne sert pas `updated_at`, et **une
 * date inventée est pire qu'une date absente** — un moteur la croit.
 */
export async function listerSlugsDeProfils(
  ressource: RessourceDeProfil,
): Promise<readonly string[]> {
  const slugs: string[] = [];
  let page = 1;
  let dernierePage = 1;

  do {
    const lot = await listerProfilsPublics(
      ressource,
      { page },
      // Le catalogue de profils ne porte aucun libellé traduit — `slug` est le même dans les trois
      // langues. La locale est passée quand même : `apiFetch` la devine sinon depuis
      // `document.cookie`, qui n'existe pas côté serveur.
      DEFAULT_LOCALE,
      TAILLE_DE_PAGE_MAX,
    );

    for (const profil of lot.profils) {
      if (profil.slug !== '') slugs.push(profil.slug);
    }
    dernierePage = lot.dernierePage;

    if (dernierePage > PAGES_MAX_SITEMAP_PROFILS) {
      throw new Error(
        `${RESSOURCES_DE_PROFIL[ressource].api} annonce ${dernierePage} pages (plafond ` +
          `${PAGES_MAX_SITEMAP_PROFILS}). À ${TAILLE_DE_PAGE_MAX} profils par page, c'est au-delà ` +
          `de ce qu'un fichier de sitemap peut porter : la réponse est incohérente, ou la ` +
          `pagination est cassée.`,
      );
    }

    page += 1;
  } while (page <= dernierePage);

  return slugs;
}
