/**
 * TCK-3010 — **l'API simulée des tests du front**, au niveau de `fetch`.
 *
 * Elle remplace les `vi.mock('@/lib/api')` et les `vi.stubGlobal('fetch')` recopiés test par test, et généralise
 * `commeLApi` (TCK-2797, visites seules, au niveau du retour d'`apiRequest`). Au niveau de `fetch`, la même
 * doublure sert `apiRequest`/`apiFetch` (Laravel en direct) et `appelBff` (les route handlers), et le test exerce
 * le vrai client : en-têtes, sérialisation de la requête, `ApiError` (TCK-3008).
 *
 * ```ts
 * const api = doublerLApi();                       // au niveau du module : installe avant chaque test, vérifie après
 * api.servir('visites', [VISITE]);                 // liste et détail, bornés par fields[] et include= comme l'API
 * api.sur('GET', '/api/property-visits/counts', { data: COMPTES });
 * api.refuser('POST', /^\/api\/bookings\/\d+\/confirm$/, 409, { code: 'booking.dossier_closed', message: '…' });
 * api.parDefaut({ data: [], meta: { total: 0 } }); // ce que rend une route non déclarée — sinon elle fait échouer le test
 * api.appels('/api/property-visits');              // le journal : méthode, chemin, requête, corps, en-têtes
 * ```
 *
 * **Ce qui fait échouer un test, après lui** (un `afterEach` que `doublerLApi` pose) : une clé lue que la requête
 * n'a pas demandée (`fields[<table>]`, `include=`) — l'écran se viderait en silence contre la vraie API —, une
 * requête qu'aucune déclaration ne sert, et un `filter[…]` envoyé à une ressource servie sans qu'une réponse le lise
 * ni le déclare (la doublure ne filtre pas : sans ce signal, un test croirait le filtre appliqué). Tous sont NOTÉS
 * pendant le test, jamais levés là où ils arrivent : une exception dans un rendu ou une requête serait avalée par
 * React Query ou par une frontière d'erreur.
 *
 * **Le coupable est le test qui a lancé la requête** : l'`afterEach` attend que le réseau se taise, démonte (RTL),
 * puis vérifie. Une lecture notée pour un test qui n'est plus en cours est ignorée. Entre deux tests, `fetch` lève :
 * aucun appel ne joint le vrai réseau.
 *
 * Une déclaration faite PENDANT un test ne vaut que pour lui ; faite au niveau du module, pour tous.
 * Le chemin journalisé et apparié est **celui que Laravel reçoit** : une URL absolue (`apiRequest`) garde son
 * chemin, une URL relative (le BFF) passe par la table des relais ci-dessous.
 *
 * Limite : une ligne recopiée (`{ ...ligne }`) perd sa surveillance ; ses lectures suivantes ne sont plus vues.
 */
import { act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

import { ApiError } from '@/lib/api';

import { RESSOURCES, type DescriptionDeRessource, type NomDeRessource } from './ressources-de-l-api';

/**
 * Les relais du BFF qui renomment le chemin, et la seule copie de cette table dans les tests (TCK-3010) : le contrat
 * TCK-1800 (`requetes-du-front.tck-1800.test.tsx`) la lit aussi.
 * - `src/app/api/admin-users/[[...path]]/route.ts` → `/api/users` ;
 * - `src/app/api/super-admin/[...path]/route.ts` → `/api/admin` (TCK-145) ;
 * - `src/app/api/super-admin-properties/[[...path]]/route.ts` → `/api/properties` ;
 * - `src/app/api/super-admin-users/route.ts` → `/api/admin/users` ;
 * - `src/app/api/impersonation/proxy/[...path]` → `/api` (`cheminParLeRelais`, ADR-0055 §6).
 *
 * Gardée contre TOUS les route handlers (`__tests__/api-simulee.test.tsx`, « les relais du BFF ») : un relais qui
 * renomme sans figurer ici rougit, au lieu de laisser le journal nommer un chemin que Laravel ne reçoit jamais.
 */
export const RELAIS_DU_BFF: readonly (readonly [string, string])[] = [
  ['/api/admin-users', '/api/users'],
  ['/api/super-admin-properties', '/api/properties'],
  ['/api/super-admin-users', '/api/admin/users'],
  ['/api/super-admin/', '/api/admin/'],
  ['/api/impersonation/proxy/', '/api/'],
];

/** Le chemin qu'un relais du BFF transmet à Laravel ; tel quel s'il n'en traverse aucun. */
export function cheminDeLApi(cheminDuFront: string): string {
  for (const [relais, api] of RELAIS_DU_BFF) {
    if (cheminDuFront.startsWith(relais)) return api + cheminDuFront.slice(relais.length);
  }
  return cheminDuFront;
}

const ORIGINE_DU_FRONT = 'http://front.test';

/** Le vrai `setTimeout`, saisi au chargement : une horloge simulée ne fige pas `auRepos`. */
const attendre = globalThis.setTimeout.bind(globalThis);

/** Le `fetch` entre deux tests : aucun appel ne joint le vrai réseau. */
const FETCH_HORS_DES_TESTS = ((entree: RequestInfo | URL) => {
  throw new Error(`fetch appelé hors d’un test (${String(entree instanceof Request ? entree.url : entree)}) : la doublure de l’API (TCK-3010) ne sert qu’entre beforeEach et afterEach, et le vrai réseau n’est jamais joint.`);
}) as typeof fetch;

/** Une requête reçue, telle que Laravel la verrait. */
export interface AppelSimule {
  readonly methode: string;
  /** Sans la requête, après les relais : `/api/property-visits`. */
  readonly chemin: string;
  readonly requete: URLSearchParams;
  /** Le corps : JSON décodé, `FormData` tel quel, `undefined` sans corps. */
  readonly corps: unknown;
  readonly entetes: Readonly<Record<string, string>>;
}

type Methode = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type Motif = string | RegExp;
type Produit<T> = T | ((appel: AppelSimule) => T | Promise<T>);
/** Un corps JSON. Pas `unknown` : il absorberait la fonction, et le producteur perdrait le type de son appel. */
type Corps = object | string | number | boolean | null;

/** Le corps d'un refus de l'API (ADR-0032, `bootstrap/app.php`) : ce qu'`ApiError` lit (TCK-3008). */
export interface CorpsDeRefus {
  readonly code?: string;
  readonly message?: string;
  readonly params?: Readonly<Record<string, unknown>>;
  /** Les erreurs de champ d'un 422 de validation. */
  readonly errors?: Readonly<Record<string, readonly string[]>>;
  readonly [autre: string]: unknown;
}

interface Reponse {
  readonly statut: number;
  readonly corps: unknown;
}

interface Declaration {
  readonly methode: string;
  readonly motif: Motif;
  readonly repondre: (appel: AppelSimule) => Promise<Reponse>;
}

export interface ApiSimulee {
  /** Sert une ressource décrite (`ressources-de-l-api.ts`) : sa liste et son détail `<route>/<id>`. */
  servir(
    ressource: NomDeRessource,
    lignes: Produit<readonly object[]>,
    options?: {
      /**
       * Ce que `meta` ajoute à `{ total, per_page, current_page, last_page }`, calculés comme l'API sur les lignes
       * produites (`page`, `per_page` : 15 par défaut, 100 au plus). Seul `total` s'y remplace (et recalcule
       * `last_page`) : les trois autres suivent la requête, comme `PaginationMeta`.
       */
      readonly meta?: Produit<Readonly<Record<string, unknown>>>;
      /**
       * Les `filter[<nom>]` que ce test prend en charge sans que le producteur les lise (un test qui ne juge que la
       * requête). Un producteur qui lit `requete.get('filter[…]')` n'a rien à déclarer.
       */
      readonly filtres?: readonly string[];
    },
  ): ApiSimulee;
  /**
   * Une réponse 2xx, rendue telle quelle (aucun bornage). Un producteur qui doit refuser selon la requête lève
   * `new ApiError(statut, corps)` : elle part sur le fil, et le client la relève comme d'une vraie réponse.
   */
  sur(methode: Methode, motif: Motif, corps: Produit<Corps>, statut?: number): ApiSimulee;
  /** Un refus, à la forme de l'API : `{ code, message, params }` ou `{ message, errors }` d'un 422. */
  refuser(methode: Methode, motif: Motif, statut: number, corps: CorpsDeRefus): ApiSimulee;
  /** La réponse de toute requête non déclarée. Sans elle, une telle requête fait échouer le test. */
  parDefaut(corps: Produit<Corps>): ApiSimulee;
  /** Le journal du test en cours, filtré sur un chemin exact si on le donne. */
  appels(chemin?: string): AppelSimule[];
  /**
   * Attend que le réseau se taise : une requête part plusieurs attentes après le rendu (celles d'`apiRequest`), et
   * peut en appeler une autre. **À placer avant toute assertion qui dit qu'une requête n'est PAS partie** : sans lui,
   * elle serait verte quoi que fasse le code. Des tâches réelles (`setTimeout`) : une horloge qui ne simule que `Date`
   * les laisse passer.
   */
  auRepos(): Promise<void>;
  /** Vide le journal, pour ne compter que ce qui suit un geste. */
  oublierLesAppels(): void;
  /** Lève, en les nommant, les lectures hors `fields`/`include` et les requêtes non servies. Rejouée après chaque test. */
  verifier(): void;
  /** Le `fetch` simulé, pour un test qui veut l'installer lui-même. */
  readonly fetch: typeof fetch;
}

function correspond(motif: Motif, chemin: string): boolean {
  return typeof motif === 'string' ? motif === chemin : motif.test(chemin);
}

function entetesDe(source: HeadersInit | undefined): Record<string, string> {
  const sortie: Record<string, string> = {};
  new Headers(source).forEach((valeur, cle) => {
    sortie[cle] = valeur;
  });
  return sortie;
}

function corpsDe(brut: BodyInit | null | undefined): unknown {
  if (brut === undefined || brut === null) return undefined;
  if (typeof brut !== 'string') return brut;
  try {
    return JSON.parse(brut);
  } catch {
    return brut;
  }
}

function lireAppel(entree: RequestInfo | URL, init: RequestInit | undefined): AppelSimule {
  const brut = entree instanceof Request ? entree.url : String(entree);
  const url = new URL(brut, ORIGINE_DU_FRONT);
  // Relative (le BFF, même origine) : le relais renomme ; absolue (Laravel en direct) : tel quel.
  const relative = url.origin === ORIGINE_DU_FRONT && !/^[a-z]+:/i.test(brut);
  return {
    methode: (init?.method ?? (entree instanceof Request ? entree.method : 'GET')).toUpperCase(),
    chemin: relative ? cheminDeLApi(url.pathname) : url.pathname,
    requete: url.searchParams,
    corps: corpsDe(init?.body),
    entetes: entetesDe(init?.headers ?? (entree instanceof Request ? entree.headers : undefined)),
  };
}

/** Ce que l'API rendrait sur le fil : une copie JSON, sans `undefined` ni référence partagée avec le test. */
function surLeFil<T>(valeur: T): T {
  return valeur === undefined ? valeur : (JSON.parse(JSON.stringify(valeur)) as T);
}

/** Les inclusions d'une requête : celles d'`include=`, plus celles que le détail charge toujours. */
function inclusionsDe(description: DescriptionDeRessource, requete: URLSearchParams, auDetail: boolean): string[] {
  const inclus = (requete.get('include') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return [...new Set([...inclus, ...(auDetail ? description.inclusAuDetail : [])])];
}

/**
 * Les clés qu'une requête fait servir, ou `null` sans `fields[<table>]` (la ressource entière). `id` n'y entre que
 * demandé, sauf si la Resource le force (`idToujours`).
 */
function clesServies(description: DescriptionDeRessource, requete: URLSearchParams, auDetail: boolean): Set<string> | null {
  const brut = requete.get(`fields[${description.table}]`);
  if (brut === null || brut.trim() === '') return null;
  const demandees = new Set(brut.split(',').map((s) => s.trim()).filter(Boolean));
  return new Set([
    ...(description.idToujours ? ['id'] : []),
    ...description.colonnes.filter((c) => demandees.has(c)),
    ...inclusionsDe(description, requete, auDetail).flatMap((i) => description.inclusions[i] ?? []),
    ...description.calculees,
  ]);
}

/** La taille de page de l'API : `per_page` borné à [1, 100] (`HasQueryBuilder::getPerPage`), sinon 15 (Eloquent). */
function tailleDePage(requete: URLSearchParams): number {
  const demande = Number(requete.get('per_page'));
  return Number.isFinite(demande) && demande >= 1 ? Math.min(Math.trunc(demande), 100) : 15;
}

/** Les `filter[<nom>]` de la requête. */
function filtresDe(requete: URLSearchParams): string[] {
  return [...requete.keys()].flatMap((cle) => /^filter\[(.+)\]$/.exec(cle)?.[1] ?? []);
}

/**
 * La requête que lit un producteur de `servir`, qui note les paramètres lus : un `filter[…]` lu est pris en charge.
 * Un parcours (`keys`, `entries`, `forEach`, `toString`…) vaut lecture de tout.
 */
function requeteSuivie(requete: URLSearchParams, lus: Set<string>): URLSearchParams {
  return new Proxy(requete, {
    get(cible, cle) {
      const valeur = Reflect.get(cible, cle, cible) as unknown;
      if (typeof valeur !== 'function') return valeur;
      const nommee = cle === 'get' || cle === 'getAll' || cle === 'has';
      return (...args: unknown[]) => {
        lus.add(nommee ? String(args[0]) : '*');
        return (valeur as (...a: unknown[]) => unknown).apply(cible, args);
      };
    },
  });
}

export function doublerLApi(): ApiSimulee {
  const permanentes: Declaration[] = [];
  let duTest: Declaration[] = [];
  let enCours = false;
  let defautPermanent: Declaration['repondre'] | null = null;
  let defautDuTest: Declaration['repondre'] | null = null;
  let journal: AppelSimule[] = [];
  const lectures = new Set<string>();
  const nonServies = new Set<string>();
  const filtresIgnores = new Set<string>();
  // Le test en cours : une lecture notée sous un autre numéro (une réponse d'un test fini) n'accuse personne.
  let epoque = 0;
  let enVol = 0;

  const declarer = (d: Declaration) => (enCours ? duTest : permanentes).push(d);

  const produire = async <T,>(p: Produit<T>, appel: AppelSimule): Promise<T> =>
    typeof p === 'function' ? await (p as (a: AppelSimule) => T | Promise<T>)(appel) : p;

  function surveiller(ligne: unknown, description: DescriptionDeRessource, servies: Set<string>, appel: AppelSimule, nulles: readonly string[]): unknown {
    if (ligne === null || typeof ligne !== 'object' || Array.isArray(ligne)) return ligne;
    const signalables = new Set([...description.colonnes, ...Object.values(description.inclusions).flat()]);
    const bornee = Object.fromEntries(Object.entries(ligne).filter(([cle]) => servies.has(cle)));
    for (const cle of nulles) if (!(cle in bornee)) bornee[cle] = null;
    const duTestEnCours = epoque;
    const noter = (cle: string | symbol) => {
      if (duTestEnCours === epoque && typeof cle === 'string' && signalables.has(cle) && !servies.has(cle)) {
        lectures.add(`« ${cle} » lue sans être demandée par fields[${description.table}] ni include= (${appel.methode} ${appel.chemin})`);
      }
    };
    return new Proxy(bornee, {
      get(cible, cle, recepteur) {
        noter(cle);
        return Reflect.get(cible, cle, recepteur);
      },
      has(cible, cle) {
        noter(cle);
        return Reflect.has(cible, cle);
      },
      getOwnPropertyDescriptor(cible, cle) {
        noter(cle);
        return Reflect.getOwnPropertyDescriptor(cible, cle);
      },
    });
  }

  /**
   * Borne une ligne ou une liste à ce que la requête fait servir. Au détail, un bloc que le contrôleur charge toujours
   * (`inclusAuDetail`) et que la ligne n'a pas vaut `null`, comme `whenLoaded` sur une relation vide.
   */
  function borner(ligneOuLignes: unknown, description: DescriptionDeRessource, appel: AppelSimule, auDetail: boolean): unknown {
    const servies = clesServies(description, appel.requete, auDetail);
    const nulles = auDetail ? description.inclusAuDetail.flatMap((i) => description.inclusions[i] ?? []) : [];
    if (servies === null) {
      if (nulles.length === 0 || ligneOuLignes === null || typeof ligneOuLignes !== 'object') return ligneOuLignes;
      return { ...Object.fromEntries(nulles.map((cle) => [cle, null])), ...ligneOuLignes };
    }
    return Array.isArray(ligneOuLignes)
      ? ligneOuLignes.map((l) => surveiller(l, description, servies, appel, nulles))
      : surveiller(ligneOuLignes, description, servies, appel, nulles);
  }

  /**
   * L'appel que voient les producteurs d'une ressource (lignes et `meta`), et, une fois la réponse produite, la note
   * des `filter[…]` que ni eux ni `filtres` n'ont pris.
   */
  function suivre(appel: AppelSimule, filtres: readonly string[]): { readonly vu: AppelSimule; noterLesIgnores(): void } {
    const lus = new Set<string>(filtres.map((f) => `filter[${f}]`));
    return {
      vu: { ...appel, requete: requeteSuivie(appel.requete, lus) },
      noterLesIgnores() {
        if (lus.has('*')) return;
        for (const filtre of filtresDe(appel.requete)) {
          if (!lus.has(`filter[${filtre}]`)) filtresIgnores.add(`filter[${filtre}] envoyé à ${appel.methode} ${appel.chemin}`);
        }
      },
    };
  }

  const simule = async (entree: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    enVol += 1;
    try {
      return await repondreA(entree, init);
    } finally {
      enVol -= 1;
    }
  };

  const repondreA = async (entree: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const appel = lireAppel(entree, init);
    journal.push(appel);
    const declaration = [...duTest].reverse().concat([...permanentes].reverse())
      .find((d) => d.methode === appel.methode && correspond(d.motif, appel.chemin));
    const defaut = defautDuTest ?? defautPermanent;
    let reponse: Reponse;
    try {
      if (declaration) reponse = await declaration.repondre(appel);
      else if (defaut) reponse = await defaut(appel);
      else {
        nonServies.add(`${appel.methode} ${appel.chemin}`);
        reponse = { statut: 404, corps: { message: `Route non doublée : ${appel.methode} ${appel.chemin}` } };
      }
    } catch (refus) {
      // Un producteur refuse selon la requête en levant l'`ApiError` que le client lèverait : elle part sur le fil.
      if (!(refus instanceof ApiError)) throw refus;
      reponse = { statut: refus.status, corps: surLeFil(refus.data) };
    }
    // Un 204 n'a pas de corps ; tout autre statut porte du JSON, que `json()` rend sous sa surveillance.
    const sansCorps = reponse.statut === 204;
    const fil = new Response(sansCorps ? null : JSON.stringify(reponse.corps ?? null), {
      status: reponse.statut,
      headers: sansCorps ? {} : { 'Content-Type': 'application/json' },
    });
    if (!sansCorps) Object.defineProperty(fil, 'json', { value: async () => reponse.corps });
    return fil;
  };

  const api: ApiSimulee = {
    servir(nom, lignes, options = {}) {
      const description = RESSOURCES[nom];
      const detail = new RegExp(`^${description.route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(\\d+)$`);
      declarer({
        methode: 'GET',
        motif: description.route,
        repondre: async (appel) => {
          const suivi = suivre(appel, options.filtres ?? []);
          const data = surLeFil(await produire(lignes, suivi.vu)) as object[];
          const ajouts = await produire(options.meta ?? {}, suivi.vu);
          suivi.noterLesIgnores();
          // La pagination de l'API (`PaginationMeta::of`) : la page demandée, et `last_page` tiré du total.
          const parPage = tailleDePage(appel.requete);
          const page = Math.max(1, Math.trunc(Number(appel.requete.get('page'))) || 1);
          const total = typeof ajouts.total === 'number' ? ajouts.total : data.length;
          return {
            statut: 200,
            corps: {
              data: borner(data.slice((page - 1) * parPage, page * parPage), description, appel, false),
              // `PaginationMeta::of` écarte les clés canoniques d'un `meta` en plus : seul `total` se donne ici.
              meta: { ...ajouts, total, per_page: parPage, current_page: page, last_page: Math.max(1, Math.ceil(total / parPage)) },
            },
          };
        },
      });
      declarer({
        methode: 'GET',
        motif: detail,
        repondre: async (appel) => {
          const id = Number(detail.exec(appel.chemin)?.[1]);
          const suivi = suivre(appel, options.filtres ?? []);
          const ligne = (surLeFil(await produire(lignes, suivi.vu)) as { id?: unknown }[]).find((l) => l.id === id);
          suivi.noterLesIgnores();
          return ligne === undefined
            ? { statut: 404, corps: { code: 'not_found', message: 'Introuvable.' } }
            : { statut: 200, corps: { data: borner(ligne, description, appel, true) } };
        },
      });
      return api;
    },
    sur(methode, motif, corps, statut = 200) {
      declarer({ methode, motif, repondre: async (appel) => ({ statut, corps: surLeFil(await produire(corps, appel)) }) });
      return api;
    },
    refuser(methode, motif, statut, corps) {
      declarer({ methode, motif, repondre: async () => ({ statut, corps: surLeFil(corps) }) });
      return api;
    },
    parDefaut(corps) {
      const repondre: Declaration['repondre'] = async (appel) => ({ statut: 200, corps: surLeFil(await produire(corps, appel)) });
      if (enCours) defautDuTest = repondre;
      else defautPermanent = repondre;
      return api;
    },
    appels(chemin) {
      return chemin === undefined ? [...journal] : journal.filter((a) => a.chemin === chemin);
    },
    async auRepos() {
      let avant = -1;
      for (let tour = 0; tour < 20 && (avant !== journal.length || enVol > 0); tour += 1) {
        avant = journal.length;
        await act(async () => {
          await new Promise((fin) => attendre(fin, 0));
        });
      }
    },
    oublierLesAppels() {
      journal = [];
    },
    verifier() {
      const defauts = [
        ...[...lectures].sort().map((l) => `- clé ${l}`),
        ...[...nonServies].sort().map((r) => `- requête non doublée : ${r} (api.sur, api.servir ou api.parDefaut)`),
        ...[...filtresIgnores].sort().map((f) => `- ${f} sans qu’une réponse le lise ni le déclare : la doublure ne filtre pas (un producteur qui lit \`requete\`, ou \`filtres\` de api.servir)`),
      ];
      lectures.clear();
      nonServies.clear();
      filtresIgnores.clear();
      if (defauts.length > 0) throw new Error(`L'API simulée a vu ce que la vraie refuserait :\n${defauts.join('\n')}`);
    },
    fetch: simule as typeof fetch,
  };

  beforeEach(() => {
    epoque += 1;
    enCours = true;
    duTest = [];
    defautDuTest = null;
    journal = [];
    lectures.clear();
    nonServies.clear();
    filtresIgnores.clear();
    globalThis.fetch = api.fetch;
  });
  // Dans cet ordre : le réseau se tait (la requête tardive tombe dans CE test), RTL démonte (plus rien ne part), on
  // vérifie, puis `fetch` lève jusqu'au test suivant. Les `afterEach` se jouent en pile : celui-ci, posé au chargement
  // du fichier de test, passe avant le nettoyage de RTL du `setupFiles`.
  afterEach(async () => {
    try {
      await api.auRepos();
      cleanup();
      await api.auRepos();
      api.verifier();
    } finally {
      globalThis.fetch = FETCH_HORS_DES_TESTS;
      enCours = false;
      duTest = [];
      defautDuTest = null;
    }
  });

  return api;
}
