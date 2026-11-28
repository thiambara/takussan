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
 * n'a pas demandée (`fields[<table>]`, `include=`) — l'écran se viderait en silence contre la vraie API —, et une
 * requête qu'aucune déclaration ne sert. Les deux sont NOTÉS pendant le test, jamais levés là où ils arrivent :
 * une exception dans un rendu ou une requête serait avalée par React Query ou par une frontière d'erreur.
 *
 * Une déclaration faite PENDANT un test ne vaut que pour lui ; faite au niveau du module, pour tous.
 * Le chemin journalisé et apparié est **celui que Laravel reçoit** : une URL absolue (`apiRequest`) garde son
 * chemin, une URL relative (le BFF) passe par la table des relais ci-dessous.
 *
 * Limite : une ligne recopiée (`{ ...ligne }`) perd sa surveillance ; ses lectures suivantes ne sont plus vues.
 */
import { act } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

import { ApiError } from '@/lib/api';

import { RESSOURCES, type DescriptionDeRessource, type NomDeRessource } from './ressources-de-l-api';

/**
 * Les relais du BFF qui renomment le chemin, et la seule copie de cette table dans les tests (TCK-3010) : le contrat
 * TCK-1800 (`requetes-du-front.tck-1800.test.tsx`) la lit aussi.
 * - `src/app/api/admin-users/[[...path]]/route.ts` → `/api/users` ;
 * - `src/app/api/super-admin/[...path]/route.ts` → `/api/admin` (TCK-145) ;
 * - `src/app/api/impersonation/proxy/[...path]` → `/api` (`cheminParLeRelais`, ADR-0055 §6).
 */
export const RELAIS_DU_BFF: readonly (readonly [string, string])[] = [
  ['/api/admin-users', '/api/users'],
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
    /** Ce que `meta` remplace dans `{ total, per_page, current_page: 1, last_page: 1 }` (une pagination, par exemple). */
    options?: { readonly meta?: Produit<Readonly<Record<string, unknown>>> },
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

/** Les clés qu'une requête fait servir, ou `null` sans `fields[<table>]` (la ressource entière). */
function clesServies(description: DescriptionDeRessource, requete: URLSearchParams): Set<string> | null {
  const brut = requete.get(`fields[${description.table}]`);
  if (brut === null || brut.trim() === '') return null;
  const demandees = new Set(brut.split(',').map((s) => s.trim()).filter(Boolean));
  const inclus = (requete.get('include') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return new Set([
    'id',
    ...description.colonnes.filter((c) => demandees.has(c)),
    ...inclus.flatMap((i) => description.inclusions[i] ?? []),
    ...description.calculees,
  ]);
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

  const declarer = (d: Declaration) => (enCours ? duTest : permanentes).push(d);

  const produire = async <T,>(p: Produit<T>, appel: AppelSimule): Promise<T> =>
    typeof p === 'function' ? await (p as (a: AppelSimule) => T | Promise<T>)(appel) : p;

  function surveiller(ligne: unknown, description: DescriptionDeRessource, servies: Set<string>, appel: AppelSimule): unknown {
    if (ligne === null || typeof ligne !== 'object' || Array.isArray(ligne)) return ligne;
    const signalables = new Set([...description.colonnes, ...Object.values(description.inclusions).flat()]);
    const bornee = Object.fromEntries(Object.entries(ligne).filter(([cle]) => servies.has(cle)));
    const noter = (cle: string | symbol) => {
      if (typeof cle === 'string' && signalables.has(cle) && !servies.has(cle)) {
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

  function borner(ligneOuLignes: unknown, description: DescriptionDeRessource, appel: AppelSimule): unknown {
    const servies = clesServies(description, appel.requete);
    if (servies === null) return ligneOuLignes;
    return Array.isArray(ligneOuLignes)
      ? ligneOuLignes.map((l) => surveiller(l, description, servies, appel))
      : surveiller(ligneOuLignes, description, servies, appel);
  }

  const simule = async (entree: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
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
          const data = surLeFil(await produire(lignes, appel)) as object[];
          const parPage = Number(appel.requete.get('per_page')) || 30;
          return {
            statut: 200,
            corps: {
              data: borner(data, description, appel),
              meta: { total: data.length, per_page: parPage, current_page: 1, last_page: 1, ...(await produire(options.meta ?? {}, appel)) },
            },
          };
        },
      });
      declarer({
        methode: 'GET',
        motif: detail,
        repondre: async (appel) => {
          const id = Number(detail.exec(appel.chemin)?.[1]);
          const ligne = (surLeFil(await produire(lignes, appel)) as { id?: unknown }[]).find((l) => l.id === id);
          return ligne === undefined
            ? { statut: 404, corps: { code: 'not_found', message: 'Introuvable.' } }
            : { statut: 200, corps: { data: borner(ligne, description, appel) } };
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
      for (let tour = 0; tour < 10 && avant !== journal.length; tour += 1) {
        avant = journal.length;
        await act(async () => {
          await new Promise((fin) => setTimeout(fin, 0));
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
      ];
      lectures.clear();
      nonServies.clear();
      if (defauts.length > 0) throw new Error(`L'API simulée a vu ce que la vraie refuserait :\n${defauts.join('\n')}`);
    },
    fetch: simule as typeof fetch,
  };

  let fetchDOrigine: typeof fetch;
  beforeEach(() => {
    enCours = true;
    duTest = [];
    defautDuTest = null;
    journal = [];
    lectures.clear();
    nonServies.clear();
    fetchDOrigine = globalThis.fetch;
    globalThis.fetch = api.fetch;
  });
  afterEach(() => {
    globalThis.fetch = fetchDOrigine;
    enCours = false;
    duTest = [];
    defautDuTest = null;
    api.verifier();
  });

  return api;
}
