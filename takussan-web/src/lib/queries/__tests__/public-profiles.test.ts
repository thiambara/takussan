import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FACETTE_NUE,
  PAGES_MAX_SITEMAP_PROFILS,
  RESSOURCES_DE_PROFIL,
  TAILLE_DE_PAGE,
  TAILLE_DE_PAGE_MAX,
  listerProfilsPublics,
  listerSlugsDeProfils,
  requeteDIndex,
  verdictDeFacette,
} from '../public-profiles';

/**
 * Les deux index publics de profils, côté front — TCK-436.
 *
 * ⚠ **Ce fichier n'éprouve QUE ce qu'un test unitaire peut éprouver** : la requête émise, la
 * transformation de la réponse, et la propagation de la panne. Ce qu'il ne prouve PAS, et qu'il
 * serait malhonnête de laisser croire : que l'API réponde cette forme-là. C'est
 * `takussan-api/tests/Feature/Public/PublicProfileIndexTest.php` qui le tient, sur la vraie base.
 */

type ReponseFeinte = { data: unknown[]; meta: Record<string, unknown> };

function feindreFetch(...reponses: ReponseFeinte[]) {
  let appel = 0;
  const spy = vi.fn(async (..._args: Parameters<typeof fetch>): Promise<unknown> => {
    const corps = reponses[Math.min(appel, reponses.length - 1)];
    appel += 1;
    return { ok: true, status: 200, json: async () => corps, text: async () => JSON.stringify(corps) };
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

function page(data: unknown[], meta: Partial<Record<string, unknown>> = {}): ReponseFeinte {
  return {
    data,
    meta: { total: data.length, per_page: 18, current_page: 1, last_page: 1, cities: [], ...meta },
  };
}

const AGENCE = {
  id: 7,
  slug: 'sahel-homes',
  name: 'Sahel Homes',
  is_verified: true,
  logo_url: 'https://exemple.test/logo.png',
  city: 'Dakar',
  cities: ['Dakar', 'Thiès'],
  portfolio_count: 12,
  rent_count: 8,
  sale_count: 4,
  reviews: { average: 4.5, count: 6 },
};

const AGENT = {
  id: 9,
  slug: 'awa-diop',
  first_name: 'Awa',
  last_name: 'Diop',
  full_name: 'Awa Diop',
  avatar_url: null,
  specialty: 'Résidentiel',
  agency: { id: 7, slug: 'sahel-homes', name: 'Sahel Homes' },
  city: 'Dakar',
  cities: ['Dakar'],
  portfolio_count: 3,
  rent_count: 3,
  sale_count: 0,
  reviews: { average: null, count: 0 },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('requeteDIndex — le filtrage est SERVEUR', () => {
  it('émet `filter[city]` et `filter[search]`, jamais un filtre client', () => {
    const q = requeteDIndex({ ville: 'Thiès', recherche: 'sahel', page: 3 }, TAILLE_DE_PAGE);
    const params = new URLSearchParams(q);

    expect(params.get('filter[city]')).toBe('Thiès');
    expect(params.get('filter[search]')).toBe('sahel');
    expect(params.get('page')).toBe('3');
    expect(params.get('per_page')).toBe(String(TAILLE_DE_PAGE));
  });

  it('omet `page` sur la première page — `?page=1` et la page nue désignent la même chose', () => {
    // C'est ce qui permet à la pagination et à la canonique de s'accorder : une seule forme d'URL
    // pour une seule page.
    expect(new URLSearchParams(requeteDIndex({ page: 1 }, TAILLE_DE_PAGE)).has('page')).toBe(false);
  });

  it('omet un filtre vide plutôt que de l’émettre vide', () => {
    const params = new URLSearchParams(requeteDIndex({ ville: '', recherche: undefined }, TAILLE_DE_PAGE));
    expect(params.has('filter[city]')).toBe(false);
    expect(params.has('filter[search]')).toBe(false);
  });

  it('ne demande jamais plus que le plafond du serveur', () => {
    // Demander au-dessus du plafond rend 422 côté API
    // (`test_ac1_per_page_est_plafonne_sur_les_deux_index`) : une page blanche, pas une page
    // tronquée. Le bornage ici est ce qui empêche un appelant de le déclencher.
    const params = new URLSearchParams(requeteDIndex({}, 5000));
    expect(params.get('per_page')).toBe(String(TAILLE_DE_PAGE_MAX));
  });

  it('n’émet AUCUN `fields[…]` — la projection est fixée par le serveur', () => {
    // La règle des sparse fieldsets vise l'excès de données. Ici l'endpoint ne sert que ce qu'il a
    // décidé de servir et n'accepte pas `allowedFields` : émettre un `fields[…]` serait un
    // paramètre ignoré, c'est-à-dire une garantie décorative. Cf. l'en-tête du module.
    expect(requeteDIndex({ ville: 'Dakar', recherche: 'x', page: 2 }, TAILLE_DE_PAGE)).not.toContain('fields');
  });
});

describe('listerProfilsPublics — la lecture de la réponse', () => {
  it('interroge le bon endpoint et normalise une agence', async () => {
    const spy = feindreFetch(page([AGENCE], { total: 1, cities: ['Dakar', 'Thiès'] }));
    const resultat = await listerProfilsPublics('agencies', {}, 'fr');

    expect(String(spy.mock.calls[0]![0])).toContain('/public/agencies?');
    expect(resultat.total).toBe(1);
    expect(resultat.villes).toEqual(['Dakar', 'Thiès']);
    expect(resultat.profils[0]).toMatchObject({
      slug: 'sahel-homes',
      nom: 'Sahel Homes',
      city: 'Dakar',
      portfolio_count: 12,
      reviews: { average: 4.5, count: 6 },
    });
  });

  it('normalise un agent — `full_name` et `avatar_url` deviennent les MÊMES cases que l’agence', async () => {
    // Le renommage vit dans le module et pas dans la carte : une carte qui connaîtrait la
    // ressource qu'elle affiche serait une carte à dupliquer.
    feindreFetch(page([AGENT]));
    const resultat = await listerProfilsPublics('agents', {}, 'fr');

    expect(resultat.profils[0]!.nom).toBe('Awa Diop');
    expect(resultat.profils[0]!.logo_url).toBeNull();
    expect(resultat.profils[0]!.agency).toMatchObject({ slug: 'sahel-homes' });
    expect(resultat.profils[0]!.reviews.average).toBeNull();
  });

  it('LÈVE quand l’API échoue — un tableau vide serait un « aucun résultat » faux', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => '' })),
    );

    await expect(listerProfilsPublics('agents', {}, 'fr')).rejects.toThrow();
  });
});

describe('listerSlugsDeProfils — la source de sitemap', () => {
  it('parcourt TOUTES les pages, pas seulement la première', async () => {
    const spy = feindreFetch(
      page([AGENCE], { current_page: 1, last_page: 2, total: 2 }),
      page([{ ...AGENCE, id: 8, slug: 'etoile' }], { current_page: 2, last_page: 2, total: 2 }),
    );

    expect(await listerSlugsDeProfils('agencies')).toEqual(['sahel-homes', 'etoile']);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(String(spy.mock.calls[1]![0])).toContain('page=2');
  });

  it('demande la taille de page MAXIMALE — 18 par page ferait 55 requêtes pour 1000 profils', async () => {
    const spy = feindreFetch(page([AGENCE]));
    await listerSlugsDeProfils('agencies');
    expect(String(spy.mock.calls[0]![0])).toContain(`per_page=${TAILLE_DE_PAGE_MAX}`);
  });

  it('refuse bruyamment un `last_page` absurde', async () => {
    feindreFetch(page([AGENCE], { last_page: PAGES_MAX_SITEMAP_PROFILS + 1 }));
    await expect(listerSlugsDeProfils('agents')).rejects.toThrow(/plafond/);
  });

  it('LÈVE en cas de panne — c’est `src/app/sitemap.ts` qui décide de dégrader, et il le dit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => '' })),
    );
    await expect(listerSlugsDeProfils('agencies')).rejects.toThrow();
  });

  it('le plafond anti-emballement reste AU-DESSUS de la limite du protocole', () => {
    // Deux plafonds qui se déclenchent dans le même ordre de grandeur, c'est un seul plafond et un
    // message trompeur (cf. `sitemap-catalogue.ts`). 200 × 48 × 3 langues = 28 800 < 50 000.
    expect(PAGES_MAX_SITEMAP_PROFILS * TAILLE_DE_PAGE_MAX * 3).toBeLessThan(50_000);
  });
});

describe('verdictDeFacette — l’espace d’URL indexables est BORNÉ par le contenu réel', () => {
  it('sans `city`, la page nue est indexable et n’interroge personne', async () => {
    const spy = feindreFetch(page([]));
    expect(await verdictDeFacette('agencies', undefined, 'fr')).toEqual(FACETTE_NUE);
    expect(await verdictDeFacette('agencies', '   ', 'fr')).toEqual(FACETTE_NUE);
    expect(spy).not.toHaveBeenCalled();
  });

  it('une ville INVENTÉE ne devient pas une page indexable', async () => {
    // Le défaut mesuré par la revue adverse : ?city=Zzzinventee-vente-de-liens rendait 200,
    // index/follow, canonique d'elle-même, titre choisi par l'appelant.
    feindreFetch(page([], { total: 0, cities: ['Dakar', 'Thiès'] }));

    expect(await verdictDeFacette('agencies', 'Zzzinventee-vente-de-liens', 'fr')).toEqual({
      indexable: false,
      ville: null,
    });
  });

  it('une ville RÉELLE reste indexable et garde sa place dans la canonique', async () => {
    feindreFetch(page([AGENCE], { total: 12, cities: ['Dakar', 'Thiès'] }));

    expect(await verdictDeFacette('agencies', 'Dakar', 'fr')).toEqual({
      indexable: true,
      ville: 'Dakar',
    });
  });

  it('rend la graphie de l’API, pas celle demandée — une seule canonique par facette', async () => {
    feindreFetch(page([AGENCE], { total: 12, cities: ['Dakar', 'Thiès'] }));

    expect(await verdictDeFacette('agents', 'THIÈS', 'fr')).toEqual({
      indexable: true,
      ville: 'Thiès',
    });
  });

  it('une ville réelle HORS de la facette plafonnée reste indexable, avec la graphie demandée', async () => {
    // `villesDuCatalogue` est plafonnée à 30 côté serveur. Décider sur l'appartenance à
    // `meta.cities` ferait passer une 31ᵉ ville réelle en `noindex` : le critère est le CONTENU.
    feindreFetch(page([AGENCE], { total: 3, cities: ['Dakar', 'Thiès'] }));

    expect(await verdictDeFacette('agents', 'Ziguinchor', 'fr')).toEqual({
      indexable: true,
      ville: 'Ziguinchor',
    });
  });

  it('une PANNE rend `indexable: false` — on ne certifie pas ce qu’on n’a pas vérifié', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => '' })),
    );

    expect(await verdictDeFacette('agencies', 'Dakar', 'fr')).toEqual({
      indexable: false,
      ville: null,
    });
  });

  it('ne demande qu’UNE ligne — le verdict porte sur `total`, pas sur la page', async () => {
    const spy = feindreFetch(page([AGENCE], { total: 12 }));
    await verdictDeFacette('agencies', 'Dakar', 'fr');

    const url = String(spy.mock.calls[0]![0]);
    expect(url).toContain('per_page=1');
    // URLSearchParams encode les crochets : la garde doit chercher la forme RÉELLEMENT émise.
    expect(url).toContain('filter%5Bcity%5D=Dakar');
  });
});

describe('RESSOURCES_DE_PROFIL — les chemins écrits une seule fois', () => {
  it('les chemins publics correspondent aux endpoints', () => {
    expect(RESSOURCES_DE_PROFIL.agencies).toEqual({ chemin: '/agencies', api: '/public/agencies' });
    expect(RESSOURCES_DE_PROFIL.agents).toEqual({ chemin: '/agents', api: '/public/agents' });
  });
});
