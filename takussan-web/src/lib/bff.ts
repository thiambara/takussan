import { ApiError, buildQueryString } from '@/lib/api';
import type { SpatieQueryParams } from '@/types/api';

/**
 * TCK-3009 — **l'appel du navigateur à un route handler du front (BFF)**, module frère d'`apiRequest`.
 *
 * Le même littéral `/api/…` vise deux serveurs (`takussan-web/CLAUDE.md`, « le préfixe `/api` ») :
 * `apiRequest` va à Laravel, avec le Bearer, le profil actif, `X-Forwarded-For`, et le détour par le relais
 * d'impersonation ; `appelBff` va aux route handlers de `src/app/api/`, sur la même origine, **avec le seul
 * cookie**. Pourquoi deux primitives et pas une option : le relais `/api/super-admin/[...path]` renomme vers
 * `/api/admin` (TCK-145) et garde le jeton de l'**opérateur** pendant une impersonation (ADR-0055) ; un
 * appel de la console qui prendrait le chemin d'`apiRequest` partirait avec le jeton de la cible. Aucun
 * en-tête d'identité ne s'écrit donc ici, et le type n'en laisse passer aucun (pas d'`headers` libre).
 *
 * Elle remplace ~220 `fetch` relatifs recopiés à la main, et une douzaine de copies d'une même lecture « JSON ou
 * `ApiError` » (une par module, dont une exportée par la coque de la console).
 * Ce qu'elle tient pour eux :
 *
 * - les paramètres sérialisés par `buildQueryString` (sparse fieldsets, ADR-0006) — ou une requête déjà
 *   construite, passée dans le chemin par `cheminApi` + `requete()` quand elle est partagée avec le serveur ;
 * - un corps JSON (`Content-Type` posé) ou un `FormData` tel quel (sans `Content-Type` : le navigateur pose
 *   la frontière du multipart) ;
 * - un 2xx SANS corps (204, 205, `Content-Length: 0`) rend `null` — l'ancien lecteur rejetait, d'où trois cas
 *   particuliers (Radar, modération) ; un 2xx dont le corps n'est pas du JSON (une page HTML d'un portail, un
 *   mandataire) est un ÉCHEC, levé en `ApiError(status, null)` : rendu `null`, il devenait chez l'appelant qui
 *   lit `json.data` une TypeError que rien ne traduit (vérification adverse de TCK-3009) ; un abandon pendant
 *   la lecture du corps se propage tel quel (`AbortError`) ;
 * - un refus lève **la même `ApiError(status, corps)`** qu'`apiRequest`, code métier et paramètres compris
 *   (TCK-3008) : un appelant n'a qu'une forme d'erreur à lire, d'où que vienne la réponse.
 *
 * Le préfixe `/api` reste écrit par l'appelant (hors de TCK-3009), et une valeur dans le chemin passe par
 * `cheminApi`. Les chemins d'impersonation restent refusés par le relais lui-même.
 *
 * **Ne passent PAS par elle**, et c'est voulu :
 * - le cycle de la session (`/api/auth/set-token`, `/api/auth/logout`, `/api/auth/me`) dans `AuthContext`
 *   et `ReinitialiserSessionClient` : la garde `AuthContext.chemin-unique.test.ts` lit ces appels dans la
 *   source, et la réponse y est un ÉTAT (pas de session), pas une erreur ;
 * - les **téléchargements** (`useExports`, l'export CSV de `privacy-requests`, `downloadAuditLogExport` et
 *   `exportAdminReport` de `super-admin`) : ils lisent un `Blob` et des en-têtes de réponse
 *   (`Content-Disposition`, `X-Export-Truncated`, `Content-Type` d'un export mis en file), pas du JSON ;
 * - tout appel DIRECT à l'API (`origineApi()`, `urlApiPublique`) : c'est `apiRequest` ou `apiFetch`.
 */

export interface OptionsBff {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Sérialisés par `buildQueryString`. Vides, ils n'ajoutent pas de `?`. */
  readonly params?: SpatieQueryParams;
  /** Un `FormData` part tel quel ; toute autre valeur part en JSON. */
  readonly body?: unknown;
  readonly signal?: AbortSignal;
  /** L'`Idempotency-Key` d'une écriture que le relais transmet (TCK-1398). */
  readonly cleIdempotence?: string;
  readonly cache?: RequestCache;
  /** Une écriture qui doit survivre au départ de la page (fermeture d'un accueil, par exemple). */
  readonly keepalive?: boolean;
}

export async function appelBff<T>(
  chemin: string,
  { method, params, body, signal, cleIdempotence, cache, keepalive }: OptionsBff = {},
): Promise<T> {
  const requete = params ? buildQueryString(params) : '';
  const url = requete === '' ? chemin : `${chemin}${chemin.includes('?') ? '&' : '?'}${requete}`;

  const enTetes: Record<string, string> = { Accept: 'application/json' };
  const multipart = body instanceof FormData;
  if (body !== undefined && !multipart) enTetes['Content-Type'] = 'application/json';
  if (cleIdempotence) enTetes['Idempotency-Key'] = cleIdempotence;

  const init: RequestInit = { credentials: 'include', headers: enTetes };
  if (method && method !== 'GET') init.method = method;
  if (body !== undefined) init.body = multipart ? body : JSON.stringify(body);
  if (signal) init.signal = signal;
  if (cache) init.cache = cache;
  if (keepalive) init.keepalive = true;

  const reponse = await fetch(url, init);
  const corps = await lireLeCorps(reponse);
  if (!reponse.ok) throw new ApiError(reponse.status, corps === ILLISIBLE ? null : corps);
  if (corps === ILLISIBLE) throw new ApiError(reponse.status, null);
  return corps as T;
}

/** Un corps présent qui n'est pas du JSON : un refus le porte en `null`, un 2xx en fait un échec. */
const ILLISIBLE = Symbol('bff.corps-illisible');

async function lireLeCorps(reponse: Response): Promise<unknown> {
  if (reponse.status === 204 || reponse.status === 205) return null;
  try {
    return await reponse.json();
  } catch (erreur) {
    // Lu par le nom : sous jsdom, la `DOMException` n'est pas toujours un `Error`.
    if ((erreur as { name?: unknown } | null)?.name === 'AbortError') throw erreur;
    return reponse.headers.get('content-length') === '0' ? null : ILLISIBLE;
  }
}
