import { NextResponse, type NextRequest } from 'next/server';

import { enTetesServeurAmont, urlApiServeur } from '@/lib/api';
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

const EN_TETES_DE_REPONSE = ['content-type', 'content-disposition', 'cache-control'] as const;

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
 * - un corps `null` sur 204/205/304 (TCK-848), et `content-type`, `content-disposition`,
 *   `cache-control` de la réponse.
 *
 * `cheminAmont` est le chemin de l'API SANS le préfixe `/api`, requête comprise (`/users/7?page=2`).
 */
export async function relayerVersApi(
  request: NextRequest,
  cheminAmont: string,
  options: OptionsRelais = {},
): Promise<NextResponse> {
  const enTetes: Record<string, string> = {
    ...(await enTetesServeurAmont()),
    Accept: (options.accepteDeLaRequete ? request.headers.get('accept') : null) ?? 'application/json',
    ...options.enTetes,
  };
  if (options.jeton) enTetes.Authorization = `Bearer ${options.jeton}`;
  const contentType = request.headers.get('content-type');
  if (contentType) enTetes['Content-Type'] = contentType;
  const langue = request.headers.get('accept-language');
  if (langue) enTetes['Accept-Language'] = langue;

  const init: RequestInit = { ...options.init, method: request.method, headers: enTetes };
  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = await request.arrayBuffer();
  }

  const amont = await fetch(urlApiServeur(cheminAmont), init);
  const enTetesReponse: Record<string, string> = {};
  for (const nom of EN_TETES_DE_REPONSE) {
    const valeur = amont.headers.get(nom);
    if (valeur) enTetesReponse[nom] = valeur;
  }

  return new NextResponse(statutSansCorps(amont.status) ? null : await amont.arrayBuffer(), {
    status: amont.status,
    headers: enTetesReponse,
  });
}
