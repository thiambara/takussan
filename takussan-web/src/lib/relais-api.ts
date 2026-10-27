import { NextResponse, type NextRequest } from 'next/server';

import {
  DELAI_API_SERVEUR_ENVOI_MS,
  DELAI_API_SERVEUR_MS,
  enTetesServeurAmont,
  urlApiServeur,
} from '@/lib/api';
import { statutSansCorps } from '@/lib/statut-sans-corps';

export type OptionsRelais = {
  /** Le Bearer à poser ; absent pour un endpoint public. */
  jeton?: string;
  /** En-têtes propres au relais (profil actif…). Aucun autre en-tête de la requête n'est relayé. */
  enTetes?: Record<string, string>;
  /** Relaie l'`Accept` de la requête (téléchargements de la console) ; sinon `application/json`. */
  accepteDeLaRequete?: boolean;
  /** Options de `fetch` côté Next (`cache`, `next.revalidate`). */
  init?: Pick<RequestInit, 'cache'> & { next?: { revalidate?: number | false } };
};

/**
 * TCK-1219 (P79.04) — le délai d'un relais qui transporte un fichier : l'export
 * (`export/[entity]`), les téléversements KYC et le téléchargement d'un export de données.
 */
export const DELAI_RELAIS_FICHIER_MS = DELAI_API_SERVEUR_ENVOI_MS;

export type OptionsAmont = {
  /** La requête du navigateur : son abandon abandonne l'appel amont, pour une lecture seulement. */
  requete?: Request;
  /** La borne de l'attente des en-têtes de la réponse ; par défaut celle de TCK-1215 (30 s). */
  delaiMs?: number;
};

/**
 * TCK-1219 (P79.04) — le `fetch` d'un relais BFF vers l'API, qui ne lève jamais.
 *
 * - **Borne** : l'attente des EN-TÊTES de la réponse, comme le `headersTimeout` d'undici (300 s)
 *   qu'elle remplace ; un fichier qui se télécharge n'est pas coupé en route.
 * - **Abandon** : celui du navigateur remonte à l'API pour un `GET` ou un `HEAD`, jamais pour une
 *   écriture, qu'elle pourrait avoir appliquée sans que l'appelant le sache.
 * - **Panne** : un rejet devient une réponse JSON portant un code BFF — 504 `upstream_timeout` au
 *   délai, 502 `upstream_unavailable` sinon —, que le relais recopie comme toute réponse de l'API.
 *   Avant, le handler levait, et le navigateur recevait la 500 de Next, sans code.
 */
export async function fetchVersApi(
  url: string | URL,
  init: RequestInit,
  { requete, delaiMs = DELAI_API_SERVEUR_MS }: OptionsAmont = {},
): Promise<Response> {
  const delai = new AbortController();
  const minuterie = setTimeout(
    () => delai.abort(new DOMException('upstream_timeout', 'TimeoutError')),
    delaiMs,
  );
  const signaux = [delai.signal];
  if (requete && ['GET', 'HEAD'].includes(requete.method)) signaux.push(requete.signal);

  try {
    return await fetch(url, { ...init, signal: AbortSignal.any(signaux) });
  } catch (erreur) {
    const horsDelai = delai.signal.aborted;
    if (!requete?.signal.aborted) console.error('[BFF] fetchVersApi', String(url), erreur);
    return Response.json(
      { code: horsDelai ? 'upstream_timeout' : 'upstream_unavailable' },
      { status: horsDelai ? 504 : 502 },
    );
  } finally {
    clearTimeout(minuterie);
  }
}

/**
 * TCK-1816 (P108.04) — `location` : une redirection de l'API est rendue au navigateur, pas suivie
 * (`redirect: 'manual'` ci-dessous).
 */
const EN_TETES_DE_REPONSE = ['content-type', 'content-disposition', 'cache-control', 'location'] as const;

/**
 * TCK-894 (P41.02) — les en-têtes que tout relais propre à un visiteur envoie à l'API : ceux du
 * chemin serveur (`enTetesServeurAmont` : chemin interne, IP du visiteur) et la langue du
 * navigateur. Sans elle, le `fetch` de Node pose `accept-language: *`, que l'API ne retient pas.
 */
export async function enTetesDuRelais(request: Request): Promise<Record<string, string>> {
  const enTetes = await enTetesServeurAmont();
  const langue = request.headers.get('accept-language');
  if (langue) enTetes['Accept-Language'] = langue;
  return enTetes;
}

/**
 * TCK-893 (P41.03) — le relais BFF commun : la requête du navigateur vers l'API, et sa réponse.
 *
 * Six relais réécrivaient chacun ce `forward()`, et chacun divergeait (corps lu en texte, en-têtes de
 * réponse perdus, ni langue ni chemin serveur). Ici, une fois :
 * - l'URL du chemin SERVEUR (`urlApiServeur`, `API_INTERNAL_URL` quand elle est posée) et ses
 *   en-têtes (`enTetesServeurAmont` : chemin interne, IP du visiteur) ;
 * - `content-type` et `accept-language` de la requête — sans la langue, le `fetch` de Node envoie
 *   `accept-language: *`, que l'API ne retient pas ;
 * - le corps en OCTETS (TCK-601 : `text()` décode en UTF-8 et corrompt un fichier) ;
 * - un délai, l’abandon d’une lecture et une réponse 502/504 JSON sur une API sans réponse
 *   (`fetchVersApi`, TCK-1219) ;
 * - un corps `null` sur 204/205/304 (TCK-848), et `content-type`, `content-disposition`,
 *   `cache-control` et `location` de la réponse ;
 * - TCK-1816 (P108.04) : une redirection de l'API n'est pas suivie (`redirect: 'manual'`) mais
 *   rendue telle quelle, pour qu'une URL présignée soit suivie par le navigateur et que ses octets
 *   ne traversent pas le serveur Next ; le corps de la réponse est relayé en flux, jamais tamponné.
 *
 * `cheminAmont` est le chemin de l'API SANS le préfixe `/api`, requête comprise (`/users/7?page=2`).
 */
export async function relayerVersApi(
  request: NextRequest,
  cheminAmont: string,
  options: OptionsRelais = {},
): Promise<NextResponse> {
  const enTetes: Record<string, string> = {
    ...(await enTetesDuRelais(request)),
    Accept: (options.accepteDeLaRequete ? request.headers.get('accept') : null) ?? 'application/json',
    ...options.enTetes,
  };
  if (options.jeton) enTetes.Authorization = `Bearer ${options.jeton}`;
  const contentType = request.headers.get('content-type');
  if (contentType) enTetes['Content-Type'] = contentType;

  const init: RequestInit = { ...options.init, method: request.method, headers: enTetes, redirect: 'manual' };
  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = await request.arrayBuffer();
  }

  // TCK-2386 — un envoi multipart transporte des fichiers (captures du Radar, preuve du registre des
  // droits) : il attend l'API jusqu'au délai des fichiers, comme les téléversements KYC.
  const multipart = contentType?.toLowerCase().startsWith('multipart/form-data') ?? false;
  const amont = await fetchVersApi(urlApiServeur(cheminAmont), init, {
    requete: request,
    ...(multipart ? { delaiMs: DELAI_RELAIS_FICHIER_MS } : {}),
  });
  const enTetesReponse: Record<string, string> = {};
  for (const nom of EN_TETES_DE_REPONSE) {
    const valeur = amont.headers.get(nom);
    if (valeur) enTetesReponse[nom] = valeur;
  }

  return new NextResponse(statutSansCorps(amont.status) ? null : amont.body, {
    status: amont.status,
    headers: enTetesReponse,
  });
}
