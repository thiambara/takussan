/**
 * TCK-3010 — le harnais lui-même : l'API simulée borne ce qu'elle sert comme la vraie (`fields[]`, `include=`),
 * nomme une clé lue sans être demandée, rend les refus à la forme qu'`ApiError` lit (TCK-3008), journalise ce que
 * Laravel recevrait (relais compris) ; le rendu de test passe le compte par le vrai `AuthProvider`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitFor } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { usePlatformAbilities } from '@/components/admin/super/PlatformAbilitiesProvider';
import { useAuth } from '@/context/AuthContext';
import { ApiError, apiRequest } from '@/lib/api';
import { appelBff } from '@/lib/bff';

import { cheminDeLApi, doublerLApi, RELAIS_DU_BFF } from '../api-simulee';
import { SUPER_ADMIN } from '../habilitations';
import { rendreLeHook } from '../rendu';

vi.mock('next/navigation', async () => (await import('@/test/navigation-url')).moduleNavigation);
import { RESSOURCES } from '../ressources-de-l-api';

// Enregistré AVANT `doublerLApi()` : les `afterAll` se jouent en pile, celui-ci passe donc APRÈS celui du harnais,
// qui fait échouer le fichier sur une requête arrivée hors d'un test. La sonde, elle, est attendue.
afterAll(() => {
  // Hors d'un test, aucun appel ne joint le vrai réseau : `fetch` lève, tout de suite.
  let issue: unknown = '`fetch` n’a pas levé hors d’un test';
  try {
    void Promise.resolve(globalThis.fetch('/api/property-visits')).catch(() => undefined);
  } catch (refus) {
    issue = refus;
  }
  expect(issue).toEqual(expect.objectContaining({ message: expect.stringMatching(/hors d’un test/) }));
});

const api = doublerLApi();

const VISITE = {
  id: 41,
  status: 'scheduled',
  scheduled_at: '2026-11-20T10:00:00Z',
  visitor_display: { name: 'Mariama Fall' },
  property: { id: 10, title: 'Villa à Almadies' },
  customer: { id: 12, first_name: 'Mariama' },
};
api.servir('visites', [VISITE]);
api.servir('reservations', [{ id: 5, kind: 'offer', notes: 'Appeler après 18 h', customer: { id: 7 }, abilities: { confirm: true } }]);
api.servir('baux', [{ id: 80, status: 'active', monthly_rent: 150_000, next_due: { amount: 150_000 }, overdue_count: 0, tenant: { id: 4 } }]);

type Liste = { data: Record<string, unknown>[]; meta: { total: number } };

describe('fields[] et include=', () => {
  it('ne sert que `id`, les colonnes demandées et les blocs inclus', async () => {
    const { data, meta } = await apiRequest<Liste>('/api/property-visits?fields[property_visits]=status&include=property');

    expect(Object.keys(data[0])).toEqual(['id', 'status', 'property']);
    expect(data[0].property).toEqual({ id: 10, title: 'Villa à Almadies' });
    expect(meta.total).toBe(1);
  });

  it('sans fields[], rend la ressource entière, comme l’API', async () => {
    const { data } = await apiRequest<Liste>('/api/property-visits');

    expect(data[0]).toEqual(VISITE);
  });

  it('sert le détail `<route>/<id>` sous la même règle, et 404 pour un id inconnu', async () => {
    const { data } = await apiRequest<{ data: Record<string, unknown> }>('/api/property-visits/41?fields[property_visits]=scheduled_at');

    // `show` charge toujours property, agent, visitor et customer (`whenLoaded`) : un bloc chargé mais vide vaut `null`.
    expect(data).toEqual({ id: 41, scheduled_at: '2026-11-20T10:00:00Z', property: VISITE.property, customer: VISITE.customer, visitor: null, agent: null });
    await expect(apiRequest('/api/property-visits/99')).rejects.toMatchObject({ status: 404 });
  });
});

describe('les réservations et les baux, selon leur description', () => {
  it('réservations : les colonnes suivent fields[bookings], les blocs que l’index charge toujours restent', async () => {
    const { data } = await apiRequest<Liste>('/api/bookings?fields[bookings]=kind');

    // `id` n'est pas forcé : sous `fields[bookings]=kind`, `BookingResource` le rend `null` (mesuré, TCK-3010).
    expect(data[0]).toEqual({ kind: 'offer', customer: { id: 7 }, abilities: { confirm: true } });
    void data[0].notes;
    expect(() => api.verifier()).toThrow(/« notes » lue sans être demandée par fields\[bookings\]/);
  });

  it('baux : `include=due_summary` apporte ses quatre clés, `tenant` attend son inclusion', async () => {
    const { data } = await apiRequest<Liste>('/api/leases?fields[leases]=status&include=due_summary');

    expect(data[0]).toEqual({ status: 'active', next_due: { amount: 150_000 }, overdue_count: 0 });
    void data[0].tenant;
    expect(() => api.verifier()).toThrow(/« tenant » lue sans être demandée par fields\[leases\] ni include=/);
  });

  it('`id` se lit seulement demandé, sauf là où la Resource le force (les visites)', async () => {
    const baux = await apiRequest<Liste>('/api/leases?fields[leases]=status');
    void baux.data[0].id;
    expect(() => api.verifier()).toThrow(/« id » lue sans être demandée par fields\[leases\]/);

    const visites = await apiRequest<Liste>('/api/property-visits?fields[property_visits]=status');
    expect(visites.data[0].id).toBe(41);
    const avecId = await apiRequest<Liste>('/api/bookings?fields[bookings]=id,kind');
    expect(avecId.data[0].id).toBe(5);
    expect(() => api.verifier()).not.toThrow();
  });

  it('le détail d’un bail charge toujours son bien (`LeaseController::show`)', async () => {
    const { data } = await apiRequest<{ data: Record<string, unknown> }>('/api/leases/80?fields[leases]=id,status');

    expect(data).toEqual({ id: 80, status: 'active', property: null });
  });
});

describe('la pagination, bornée comme l’API', () => {
  const lignes = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, status: 'active' }));

  it('`page` et `per_page` découpent la liste ; `total` et `last_page` suivent', async () => {
    api.servir('baux', lignes);

    const { data, meta } = await apiRequest<Liste & { meta: Record<string, number> }>('/api/leases?per_page=15&page=3');

    expect(data.map((l) => l.id)).toEqual([31, 32, 33, 34, 35, 36, 37, 38, 39, 40]);
    expect(meta).toEqual({ total: 40, per_page: 15, current_page: 3, last_page: 3 });
  });

  it('sans `per_page`, la taille d’Eloquent (15) ; au-delà de 100, 100 (`HasQueryBuilder::PER_PAGE_MAX`)', async () => {
    api.servir('baux', [...lignes, ...lignes.map((l) => ({ ...l, id: l.id + 40 })), ...lignes.map((l) => ({ ...l, id: l.id + 80 }))]);

    const parDefaut = await apiRequest<Liste & { meta: Record<string, number> }>('/api/leases');
    const plafond = await apiRequest<Liste & { meta: Record<string, number> }>('/api/leases?per_page=500');

    expect([parDefaut.data.length, parDefaut.meta.per_page, parDefaut.meta.last_page]).toEqual([15, 15, 8]);
    expect([plafond.data.length, plafond.meta.per_page, plafond.meta.last_page]).toEqual([100, 100, 2]);
  });

  it('un producteur qui donne `meta.total` rend déjà sa page : elle n’est pas redécoupée', async () => {
    api.servir('baux', lignes.slice(15, 30), { meta: { total: 40 } });

    const { data, meta } = await apiRequest<Liste & { meta: Record<string, number> }>('/api/leases?page=2&per_page=15');

    expect(data.map((l) => l.id)).toEqual(lignes.slice(15, 30).map((l) => l.id));
    expect(meta).toEqual({ total: 40, per_page: 15, current_page: 2, last_page: 3 });
  });

  it('une page déjà découpée qui contredit la requête ou son `total` fait échouer le test', async () => {
    api.servir('baux', ({ requete }) => (requete.get('page') === '1' ? lignes.slice(0, 20) : lignes.slice(0, 5)), { meta: ({ requete }) => ({ total: requete.get('page') === '1' ? 40 : 3 }) });

    await apiRequest('/api/leases?page=1&per_page=15');
    await apiRequest('/api/leases?page=2&per_page=15');

    expect(() => api.verifier()).toThrow(/20 lignes pour per_page=15[\s\S]*5 lignes pour total=3/);
  });

  // Mesuré par PHP (TCK-3010, tour c) : `page` par `PaginationState` (FILTER_VALIDATE_INT, ≥ 1, sinon 1),
  // `per_page` par `HasQueryBuilder::getPerPage` (`is_numeric`, `(int)` qui tronque, ≥ 1, au plus 100, sinon 15).
  it.each([
    ['2.5', 1, 2], ['0.5', 1, 15], ['1.9', 1, 1], ['', 1, 15], ['0x1A', 1, 15], ['007', 1, 7], ['1e1', 1, 10],
    ['+3', 3, 3], ['-2', 1, 15], ['3abc', 1, 15], ['1e5', 1, 100], ['.5', 1, 15],
  ])('`%s` : page %i, per_page %i, comme l’API', async (valeur, page, parPage) => {
    api.servir('baux', [...lignes, ...lignes, ...lignes, ...lignes, ...lignes, ...lignes, ...lignes, ...lignes]);
    const v = encodeURIComponent(valeur);

    const { meta: m1 } = await apiRequest<{ meta: Record<string, number> }>(`/api/leases?page=${v}&per_page=1`);
    const { meta: m2 } = await apiRequest<{ meta: Record<string, number> }>(`/api/leases?per_page=${v}`);

    expect([m1.current_page, m2.per_page]).toEqual([page, parPage]);
  });
});

describe('filter[] : la doublure ne filtre pas, et le dit', () => {
  it('un filter[] qu’aucune réponse ne lit ni ne déclare fait échouer le test', async () => {
    await apiRequest('/api/property-visits?filter[status]=scheduled');

    expect(() => api.verifier()).toThrow(/filter\[status\] envoyé à GET \/api\/property-visits sans qu’une réponse le lise ni le déclare/);
  });

  it('un producteur qui lit le filtre le prend en charge', async () => {
    api.servir('visites', ({ requete }) => (requete.get('filter[status]') === 'scheduled' ? [VISITE] : []));

    await apiRequest('/api/property-visits?filter[status]=scheduled');

    expect(() => api.verifier()).not.toThrow();
  });

  it('`filtres` le déclare, pour un test qui ne juge que la requête', async () => {
    api.servir('visites', [VISITE], { filtres: ['status'] });

    await apiRequest('/api/property-visits?filter[status]=scheduled&filter[day]=2026-11-20');

    expect(() => api.verifier()).toThrow(/filter\[day\]/);
    expect(api.appels('/api/property-visits')[0].requete.get('filter[status]')).toBe('scheduled');
  });

  it('`filtres` refuse un filtre que le modèle n’autorise pas : l’API le refuserait en 400', () => {
    expect(() => api.servir('visites', [VISITE], { filtres: ['statuss'] })).toThrow(/visites.*filter\[statuss\].*PropertyVisit/);
  });

  it('un filter[] inconnu du modèle rend 400, comme spatie, et fait échouer le test', async () => {
    api.servir('visites', ({ requete }) => (requete.get('filter[statuss]') ? [VISITE] : []));

    await expect(apiRequest('/api/property-visits?filter[statuss]=scheduled')).rejects.toMatchObject({ status: 400 });
    expect(() => api.verifier()).toThrow(/filter\[statuss\] inconnu de GET \/api\/property-visits/);
  });
});

describe('une requête tardive accuse le test qui l’a lancée', () => {
  // Le harnais attend le repos dans son `afterEach`, puis démonte : la requête qu'un hook lance après la dernière
  // assertion tombe dans CE test, qui échoue en la nommant (ici, attendu : `it.fails`).
  it.fails('le test qui laisse partir une requête non doublée échoue', () => {
    const plusTard = async () => {
      await new Promise((fin) => setTimeout(fin, 0));
      return apiRequest('/api/route-tardive');
    };
    rendreLeHook(() => useQuery({ queryKey: ['tardive'], queryFn: plusTard }));
  });

  it('le test suivant ne reçoit rien d’elle', async () => {
    await api.auRepos();

    expect(api.appels()).toEqual([]);
    expect(() => api.verifier()).not.toThrow();
  });

  // `auRepos` ne voit pas une minuterie : le harnais ne peut pas retenir le test A, mais la requête porte son
  // étiquette. Elle n'entre ni au journal ni dans les déclarations de B, et B échoue en nommant A.
  it('A — lance une requête dans 60 ms, puis finit', () => {
    setTimeout(() => void apiRequest('/api/route-de-a').catch(() => undefined), 60);
  });

  it('B — la requête de A arrive pendant B : B échoue en nommant A, et rien d’elle ne compte pour B', async () => {
    await new Promise((fin) => setTimeout(fin, 120));

    expect(api.appels()).toEqual([]);
    expect(() => api.verifier()).toThrow(/GET \/api\/route-de-a lancée par le test « .*A — lance une requête dans 60 ms, puis finit » après sa fin/);
  });

  // La première attente du repos, AVANT le démontage : sans elle, ce qu'un composant monté lance encore (ici, la
  // requête que la première réponse débloque) ne partirait jamais, et le test serait vert.
  it.fails('une requête dépendante, que seul le composant monté lance, accuse le test', () => {
    rendreLeHook(() => {
      const premiere = useQuery({ queryKey: ['premiere'], queryFn: () => apiRequest<Liste>('/api/property-visits') });
      return useQuery({ queryKey: ['dependante'], queryFn: () => apiRequest('/api/route-dependante'), enabled: premiere.isSuccess });
    });
  });
});

describe('AC1 — une clé lue hors de fields[] fait échouer le test, et elle y est nommée', () => {
  it('par `apiRequest` (Laravel en direct)', async () => {
    const { data } = await apiRequest<Liste>('/api/property-visits?fields[property_visits]=status');

    expect(data[0].status).toBe('scheduled');
    expect(() => api.verifier()).not.toThrow();
    expect(data[0].visitor_display).toBeUndefined();
    expect(() => api.verifier()).toThrow(/« visitor_display » lue sans être demandée par fields\[property_visits\] ni include= \(GET \/api\/property-visits\)/);
  });

  it('un bloc non inclus aussi', async () => {
    const { data } = await apiRequest<Liste>('/api/property-visits?fields[property_visits]=status&include=property');

    void data[0].customer;
    expect(() => api.verifier()).toThrow(/« customer »/);
  });

  it('par `appelBff` (la réponse JSON reste surveillée)', async () => {
    const { data } = await appelBff<Liste>('/api/property-visits', { params: { fields: { property_visits: ['status'] } } });

    void data[0].scheduled_at;
    expect(() => api.verifier()).toThrow(/« scheduled_at »/);
  });

  it('une requête qu’aucune déclaration ne sert est nommée aussi', async () => {
    await expect(apiRequest('/api/leases/7/renew', { method: 'POST' })).rejects.toBeInstanceOf(ApiError);

    expect(() => api.verifier()).toThrow(/requête non doublée : POST \/api\/leases\/7\/renew/);
  });

  it('`parDefaut` la sert, pour ce test seulement', async () => {
    api.parDefaut({ data: [] });

    await expect(apiRequest('/api/agencies/3/team-today')).resolves.toEqual({ data: [] });
  });
});

describe('les refus, à la forme de l’API (TCK-3008)', () => {
  it('`apiRequest` et `appelBff` lèvent la même `ApiError`, code métier et paramètres compris', async () => {
    api.refuser('POST', /^\/api\/bookings\/\d+\/confirm$/, 409, {
      code: 'booking.dossier_closed',
      message: 'Le dossier est clos.',
      params: { since: '2026-11-01' },
    });

    for (const appel of [
      () => apiRequest('/api/bookings/5/confirm', { method: 'POST', token: 'jeton' }),
      () => appelBff('/api/bookings/5/confirm', { method: 'POST' }),
    ]) {
      const erreur = await appel().catch((e: unknown) => e);
      expect(erreur).toBeInstanceOf(ApiError);
      expect(erreur).toMatchObject({ status: 409, codeMetier: 'booking.dossier_closed', params: { since: '2026-11-01' }, proseServeur: 'Le dossier est clos.' });
    }
  });

  it('un 422 de validation porte ses erreurs de champ', async () => {
    api.refuser('PATCH', '/api/leases/3', 422, { message: 'Données invalides.', errors: { monthly_rent: ['Obligatoire.'] } });

    const erreur = (await apiRequest('/api/leases/3', { method: 'PATCH', body: {} }).catch((e: unknown) => e)) as ApiError;
    expect(erreur.status).toBe(422);
    expect(erreur.data).toEqual({ message: 'Données invalides.', errors: { monthly_rent: ['Obligatoire.'] } });
  });

  it('une déclaration faite pendant un test ne survit pas au test', async () => {
    await expect(apiRequest('/api/bookings/5/confirm', { method: 'POST' })).rejects.toMatchObject({ status: 404 });
    expect(() => api.verifier()).toThrow(/POST \/api\/bookings\/5\/confirm/);
  });
});

describe('`auRepos` : une assertion d’absence n’est pas vide', () => {
  it('la requête qu’un hook émet n’est au journal qu’après les attentes d’`apiRequest`', async () => {
    rendreLeHook(() => useQuery({ queryKey: ['repos'], queryFn: () => apiRequest('/api/property-visits') }));

    expect(api.appels()).toEqual([]);
    await api.auRepos();
    expect(api.appels('/api/property-visits')).toHaveLength(1);
  });
});

describe('le journal : ce que Laravel reçoit', () => {
  it('une URL relative passe par les relais du BFF, une absolue garde son chemin', async () => {
    api.sur('GET', '/api/admin/agencies', { data: [] });
    api.sur('GET', '/api/users', { data: [] });

    await appelBff('/api/super-admin/agencies', { params: { filter: { status: 'pending' } } });
    await appelBff('/api/admin-users');
    await apiRequest('/api/admin/agencies');

    await apiRequest('/api/users');
    // `apiRequest` pendant une impersonation : le relais same-origin (ADR-0055 §6), que Laravel reçoit sans préfixe.
    await appelBff('/api/impersonation/proxy/users');

    expect(api.appels().map((a) => `${a.methode} ${a.chemin}`)).toEqual([
      'GET /api/admin/agencies',
      'GET /api/users',
      'GET /api/admin/agencies',
      'GET /api/users',
      'GET /api/users',
    ]);
    expect(api.appels('/api/admin/agencies')[0].requete.get('filter[status]')).toBe('pending');
  });

  it('le corps JSON est décodé', async () => {
    api.sur('POST', '/api/leases', { data: { id: 9 } }, 201);

    await apiRequest('/api/leases', { method: 'POST', body: { monthly_rent: 150000 } });

    expect(api.appels('/api/leases')[0].corps).toEqual({ monthly_rent: 150000 });
  });
});

describe('le rendu de test : le compte passe par le vrai `AuthProvider`', () => {
  function useMaListe() {
    const { token } = useAuth();
    return useQuery({ queryKey: ['visites', token], queryFn: () => apiRequest<Liste>('/api/property-visits', { token: token ?? undefined }) });
  }

  it('le Bearer et le profil actif partent avec l’appel, et rien d’autre ne part au montage', async () => {
    const { result } = rendreLeHook(useMaListe, { compte: { utilisateur: { id: 7 }, jeton: 'jeton-7', profilActif: '42' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.appels()).toHaveLength(1);
    expect(api.appels()[0].entetes).toMatchObject({ authorization: 'Bearer jeton-7', 'x-active-profile-hint': '42' });
  });

  it('un compte sans profil actif n’hérite pas de celui du rendu précédent', async () => {
    rendreLeHook(useMaListe, { compte: { utilisateur: { id: 7 }, jeton: 'jeton-7', profilActif: '42' } });
    await waitFor(() => expect(api.appels()).toHaveLength(1));
    const { result } = rendreLeHook(useMaListe, { compte: { utilisateur: { id: 8 }, jeton: 'jeton-8' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, second] = api.appels();
    expect(second.entetes).toMatchObject({ authorization: 'Bearer jeton-8' });
    expect(second.entetes).not.toHaveProperty('x-active-profile-hint');
  });

  it('un visiteur sans session n’envoie ni jeton ni profil', async () => {
    const { result } = rendreLeHook(useMaListe, { compte: null });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.appels()[0].entetes).not.toHaveProperty('authorization');
    expect(api.appels()[0].entetes).not.toHaveProperty('x-active-profile-hint');
  });

  it('la langue, les gestes de la console et la requête de départ de la navigation', () => {
    const { result } = rendreLeHook(
      () => ({ langue: useLocale(), superAdmin: usePlatformAbilities().can(), vue: useSearchParams().get('vue') }),
      { locale: 'en', gestes: SUPER_ADMIN, url: 'vue=to_confirm' },
    );

    expect(result.current).toEqual({ langue: 'en', superAdmin: true, vue: 'to_confirm' });
    expect(rendreLeHook(() => usePlatformAbilities().can()).result.current).toBe(false);
  });

  it('chaque rendu a son `QueryClient`', () => {
    const premier = rendreLeHook(() => null).client;
    const second = rendreLeHook(() => null).client;

    expect(premier).not.toBe(second);
  });
});

describe('les descriptions de ressources suivent les `Resource` PHP', () => {
  const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

  /** Les clés de premier niveau du tableau que rend la méthode (12 espaces : le tableau de `return [`). */
  function clesDuPhp(fichier: string, methode: string): string[] {
    const php = readFileSync(join(RACINE, 'takussan-api', fichier), 'utf8');
    const corps = new RegExp(`function ${methode}\\(Request \\$request\\): array\\n    \\{([\\s\\S]*?)\\n    \\}\\n`).exec(php)?.[1] ?? '';
    return [...corps.matchAll(/^ {12}'([a-z_0-9]+)' =>/gm)].map((m) => m[1]);
  }

  it.each(Object.entries(RESSOURCES))('%s : chaque clé de la ressource est classée, et rien d’autre', (_nom, description) => {
    const methode = description.table === 'property_visits' ? 'toutesLesCles' : 'toArray';
    const php = clesDuPhp(description.php, methode);
    const inclusions = Object.values(description.inclusions).flat();
    const classees = new Set([...description.colonnes, ...description.calculees, ...inclusions]);

    expect(php.length).toBeGreaterThan(10);
    // `id` forcé : seule `PropertyVisitResource::requestedFields` l'ajoute (`['id', ...$noms]`).
    const source = readFileSync(join(RACINE, 'takussan-api', description.php), 'utf8');
    expect(description.idToujours, 'idToujours suit la Resource').toBe(source.includes("['id', ...$noms]"));
    expect(php.filter((c) => !classees.has(c)), 'clés de la Resource que la description ne classe pas').toEqual([]);
    expect([...description.colonnes, ...description.calculees].filter((c) => !php.includes(c)), 'clés décrites que la Resource ne rend pas').toEqual([]);
  });
});

describe('les filtres permis suivent les `allowedFilters` des modèles PHP', () => {
  const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

  /** Une liste de chaînes PHP : `['a', 'b']`. */
  const chaines = (liste: string | undefined) => [...(liste ?? '').matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]);

  /**
   * Ce que `HasQueryBuilder::getAllowedQueryFilters` compose : `$requestFilterable` et `$requestFilterablePartial`
   * tels quels, `$requestRangeFilters` en `_min`/`_max`, `search` si `$requestSearchFields` n'est pas vide, et tout
   * `AllowedFilter::<sorte>('<nom>'` du modèle (`customQueryFilters`, ou la surcharge des visites).
   */
  function filtresDuPhp(fichier: string): string[] {
    const php = readFileSync(join(RACINE, 'takussan-api', fichier), 'utf8');
    const propriete = (nom: string) => new RegExp(`static (?:\\??array )?\\$${nom} = \\[([^\\]]*)\\]`).exec(php)?.[1];
    const nommes = [...php.matchAll(/AllowedFilter::[a-zA-Z]+\(\s*'([a-z_0-9]+)'/g)].map((m) => m[1]);
    // Un `AllowedFilter::` dont le nom n'est pas un littéral échapperait à la lecture : il rougit.
    expect(php.match(/AllowedFilter::[a-zA-Z]+\(/g)?.length ?? 0, `${fichier} : un AllowedFilter sans nom littéral`).toBe(nommes.length);
    return [...new Set([
      ...chaines(propriete('requestFilterable')),
      ...chaines(propriete('requestFilterablePartial')),
      ...chaines(propriete('requestRangeFilters')).flatMap((c) => [`${c}_min`, `${c}_max`]),
      ...(chaines(propriete('requestSearchFields')).length > 0 ? ['search'] : []),
      ...nommes,
    ])].sort();
  }

  it.each(Object.entries(RESSOURCES))('%s : les filtres permis sont ceux du modèle, et rien d’autre', (_nom, description) => {
    const php = filtresDuPhp(description.modele);

    expect(php.length).toBeGreaterThan(8);
    expect([...description.filtresPermis].sort()).toEqual(php);
  });
});

describe('les relais du BFF : la table suit les route handlers', () => {
  const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app');

  /**
   * Les route handlers qui ne transmettent pas leur propre chemin à Laravel, chacun avec sa raison. Tout autre
   * `src/app/api/**\/route.ts` doit garder son chemin ou être traduit par `RELAIS_DU_BFF` : un oubli rougit ici.
   */
  const SANS_RELAIS: Record<string, string> = {
    '/api/auth/me': 'par `getMe` (`/api/auth/me`), même chemin',
    '/api/auth/session-expired': 'efface le cookie de session',
    '/api/auth/set-token': 'pose le cookie de session',
    '/api/auth/logout': 'par `logout` (`/api/auth/logout`), même chemin ; clôt aussi l’impersonation (`/admin/impersonate/stop`)',
    '/api/me/active-profile': 'par `patchActiveProfile` (`/api/me/active-profile`), même chemin, puis le cookie',
    '/api/me/profiles': 'par `fetchMyProfiles` (`/api/me/profiles`), même chemin',
    '/api/me/wizard-drafts': 'par `fetchMyWizardDrafts` (`/api/me/wizard-drafts`), même chemin',
    '/api/me/wizard-drafts/*': 'par `buildPath` (`/api/me/wizard-drafts/${key}`), même chemin',
    '/api/impersonation/start': 'geste du BFF : `POST /admin/users/{id}/impersonate`, puis le cookie',
    '/api/impersonation/stop': 'geste du BFF : `POST /admin/impersonate/stop`, puis le cookie',
    '/api/revalidation/fiche': 'revalide le cache de Next, ne joint pas Laravel',
    '/api/sante': 'sonde `/up`, hors du préfixe `/api`',
  };

  function routes(dossier: string): string[] {
    return readdirSync(dossier, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? routes(join(dossier, e.name)) : e.name === 'route.ts' ? [join(dossier, e.name)] : [],
    );
  }

  /** Le chemin du route handler, `[id]`, `[...path]` et `[[...path]]` notés `*`. */
  const duFront = (fichier: string) => '/' + relative(APP, dirname(fichier)).split(sep).map((s) => (s.startsWith('[') ? '*' : s)).join('/');
  /** Le préfixe fixe, avant le premier segment variable : c'est lui qu'un relais traduit. */
  const fixe = (chemin: string) => chemin.split(/\*|\$\{/)[0].replace(/\/$/, '');

  it('chaque route handler garde son chemin, est traduit par `RELAIS_DU_BFF`, ou dit pourquoi', () => {
    const ecarts: string[] = [];
    const vus = new Set<string>();
    const servis = new Set<string>();
    for (const fichier of routes(join(APP, 'api'))) {
      const front = duFront(fichier);
      vus.add(front);
      if (front in SANS_RELAIS) continue;
      const source = readFileSync(fichier, 'utf8');
      // Le chemin que le handler demande à Laravel : `urlApiServeur` et `relayerVersApi` sans `/api`, `apiRequest` avec.
      const cibles = [...source.matchAll(/(?:relayerVersApi\(request, |urlApiServeur\(|apiRequest(?:<[^>]*>)?\()[`']([^`']*)[`']/g)]
        .map((m) => fixe(m[1].replace(/^\/api(?=\/|$)/, '')));
      if (cibles.length === 0) ecarts.push(`${front} : aucun chemin de Laravel lu, ni raison dans SANS_RELAIS`);
      for (const cible of new Set(cibles)) {
        const entree = RELAIS_DU_BFF.find(([depuis]) => `${fixe(front)}/sonde`.startsWith(depuis));
        if (entree) servis.add(entree[0]);
        const recu = cheminDeLApi(`${fixe(front)}/sonde`);
        if (recu !== `/api${cible}/sonde`) ecarts.push(`${front} → Laravel ${cible || '/'}… ; la table traduit en ${recu}`);
      }
    }
    for (const nom of Object.keys(SANS_RELAIS)) if (!vus.has(nom)) ecarts.push(`${nom} : dans SANS_RELAIS, mais aucun route handler`);

    expect(ecarts).toEqual([]);
    // Et chaque entrée de la table sert un route handler : une entrée morte rougit aussi.
    expect(RELAIS_DU_BFF.map(([depuis]) => depuis).filter((d) => !servis.has(d)), 'entrées de RELAIS_DU_BFF sans route handler').toEqual([]);
  });
});
