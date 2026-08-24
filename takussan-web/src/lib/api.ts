import type { SpatieQueryParams } from '@/types/api';

// Base URL without /api suffix — used by apiRequest (which includes /api in its paths)
const API_URL = process.env.NEXT_PUBLIC_API_URL
  ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api$/, '')
  : 'http://localhost:8002';

// API base with /api suffix — used by apiFetch
const API_BASE = `${API_URL}/api`;
const SUPPORTED_LOCALES = new Set(['fr', 'en', 'wo']);

function clientLocaleCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined;

  const cookie = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith('NEXT_LOCALE='));
  const locale = cookie ? decodeURIComponent(cookie.split('=')[1] ?? '') : '';

  return SUPPORTED_LOCALES.has(locale) ? locale : undefined;
}

export type ApiFetchOptions = {
  /**
   * Locale à transmettre en `Accept-Language`. **Obligatoire côté serveur** : le repli
   * automatique passe par le cookie du navigateur, qui n'existe pas en RSC.
   */
  locale?: string;
};

/**
 * Appel des endpoints PUBLICS. Le préfixe `/api` est ajouté par la fonction — cf. le tableau
 * d'ouverture de `takussan-web/CLAUDE.md`.
 *
 * ⚠️ **Elle lève `ApiError`, comme {@link apiRequest} — depuis TCK-335.** Elle levait un `Error`
 * nu dont le statut n'existait que comme SOUS-CHAÎNE du message (`API error 422: /public/…`), et
 * le corps de la réponse n'était jamais lu. L'appelant ne pouvait donc rien distinguer : sur la
 * page de résultats, un 422 « ce filtre n'est pas valide » et une panne réseau produisaient le
 * même écran — « 0 bien trouvé », c'est-à-dire une réponse là où il y avait une erreur.
 *
 * La bascule est rétro-compatible et c'est mesuré : des 19 appelants d'`apiFetch`, un seul
 * inspecte l'erreur — `useProperty` teste `/\b404\b/` sur `err.message` — et `ApiError` construit
 * `super('API error 404')`, que la même expression reconnaît.
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  options: ApiFetchOptions = {},
): Promise<T> {
  // TCK-335 — la locale part en `Accept-Language`, comme le fait `apiRequest`. Sans elle,
  // les libellés d'énumération de l'API (`type_label`, `contract_type_label`, `status_label`)
  // sortent dans `APP_LOCALE` — c'est-à-dire dans la langue du SERVEUR, pas du visiteur — et
  // les deux surfaces les plus parcourues du site public, `/properties` et la fiche, étaient
  // justement celles qui passaient par ici.
  //
  // ⚠ L'appelant SERVEUR doit passer `locale` explicitement : `clientLocaleCookie()` lit
  // `document.cookie` et rend `undefined` hors navigateur, **en silence**. C'est le patron de
  // `RequestOptions.locale` ci-dessous, et il existe pour cette raison précise.
  const locale = options.locale ?? clientLocaleCookie();
  const enTetes: Record<string, string> = {
    Accept: 'application/json',
    ...(locale ? { 'Accept-Language': locale } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: enTetes,
  });
  if (!res.ok) {
    // Le corps est lu SUR LE CHEMIN D'ERREUR uniquement : c'est lui qui porte
    // `errors.<champ>` sur un 422, donc le nom du filtre en cause.
    const corps = await res.json().catch(() => null);
    throw new ApiError(res.status, corps);
  }
  return res.json() as Promise<T>;
}

export type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
  formData?: boolean;
  /**
   * Locale to forward to the backend via `Accept-Language` for localized
   * responses (error messages, mail templates, etc.). Optional — the backend
   * falls back to its default when absent.
   */
  locale?: string;
  signal?: AbortSignal;
  /**
   * Active profile composite id (e.g. `agent:5`) forwarded as
   * `X-Active-Profile-Hint` so the backend resolves the spatie team scope
   * without relying on a browser-bound cookie. Soft signal: an invalid /
   * stale value is silently ignored by the backend (cookie-style). Set by
   * SSR fetchers — see TCK-141 / TCK-143.
   */
  activeProfileId?: string;
};

/**
 * Codes d'erreur émis par les **route handlers BFF** de `src/app/api/**` (TCK-292, AC7).
 *
 * ⚠️ **Un route handler n'a pas le droit d'émettre de la prose destinée à l'écran.** C'est le
 * principe non négociable n°5 du dépôt — *« le front possède le texte affiché ; l'API émet des
 * codes et des données »* — et le BFF EST du front. Il émettait pourtant 42 messages en anglais
 * répartis sur 22 de ses 31 fichiers, dont 18 « Unauthenticated. » / « Not authenticated. » sur
 * le chemin 401. Une session qui expirait pendant un téléversement KYC — un événement ordinaire —
 * affichait donc **« Not authenticated. »** en bannière ET en toast, dans une interface française.
 *
 * Le handler émet désormais `{ code }` et rien d'autre ; c'est le front qui choisit le libellé,
 * via {@link CLE_I18N_ERREUR_BFF}. Le détail de la panne, lui, part au **journal serveur**
 * (`console.error` dans le handler) — il est utile au développeur, jamais à l'utilisateur.
 */
export const CODES_ERREUR_BFF = [
  'unauthenticated',
  'invalid_profile_id',
  'invalid_json_body',
  'profile_id_required',
  'unknown_entity',
  'server_error',
] as const;

export type CodeErreurBff = (typeof CODES_ERREUR_BFF)[number];

/** Chemin de dictionnaire (next-intl, racine) pour chaque code du BFF. */
export const CLE_I18N_ERREUR_BFF: Record<CodeErreurBff, string> = {
  unauthenticated: 'errors.api.unauthenticated',
  invalid_profile_id: 'errors.api.invalidProfileId',
  invalid_json_body: 'errors.api.invalidJsonBody',
  profile_id_required: 'errors.api.profileIdRequired',
  unknown_entity: 'errors.api.unknownEntity',
  server_error: 'errors.api.serverError',
};

/** Clé du libellé générique, quand rien de plus précis n'est connu. */
export const CLE_I18N_ERREUR_INCONNUE = 'errors.api.unknown';

function estCodeBff(valeur: unknown): valeur is CodeErreurBff {
  return typeof valeur === 'string' && (CODES_ERREUR_BFF as readonly string[]).includes(valeur);
}

/**
 * Les codes que la SURFACE DE RENDU sait traduire : ceux qu'émet le BFF, plus ceux qu'on déduit
 * du statut HTTP quand le serveur n'a rien dit d'exploitable.
 *
 * C'est une **donnée**, pas un libellé. Un `ApiError` traverse trois contextes qui n'accèdent pas
 * au dictionnaire de la même façon — composant client (`useTranslations`), module `'use server'`
 * (`getTranslations` de `next-intl/server`), gestionnaire de requête React Query — et aucun objet
 * d'erreur ne peut savoir dans lequel il sera lu. Il porte donc le code ; le texte est choisi au
 * point de rendu, par celui qui tient un traducteur.
 */
export const CODES_ERREUR_API = [
  ...CODES_ERREUR_BFF,
  'too_many_requests',
  'network',
  'unknown',
] as const;

export type CodeErreurApi = (typeof CODES_ERREUR_API)[number];

/** Chemin de dictionnaire (next-intl, racine) pour chaque code de {@link CODES_ERREUR_API}. */
export const CLE_I18N_ERREUR_API: Record<CodeErreurApi, string> = {
  ...CLE_I18N_ERREUR_BFF,
  too_many_requests: 'errors.api.tooManyRequests',
  network: 'errors.api.network',
  unknown: 'errors.api.unknown',
};

/**
 * Les chaînes anglaises que Laravel laisse passer NON TRADUITES, une par famille : le 401
 * (`AuthenticationException`), la 5xx de production (`APP_DEBUG=false`) et le 429
 * (`ThrottleRequests`). Le titre disait « la seule chaîne … sur un 401 » alors que la table en
 * portait déjà trois : c'est la faute d'origine de cette famille — un docblock qui décrit l'état
 * d'avant — recommise dans le correctif qui la répare. Ajouter une entrée, c'est amender ceci.
 *
 * ⚠️ **Corriger le BFF ne suffisait pas, et c'est la moitié du défaut qu'on aurait manquée.** Un
 * route handler proxifie la réponse du backend telle quelle dès que la requête sort de son propre
 * chemin d'erreur. Or Laravel rend `{"message":"Unauthenticated."}` — la valeur par défaut de
 * `AuthenticationException`, jamais passée par `lang/` — et `EnsureSuperAdmin` la recopie à la
 * main (`app/Http/Middleware/EnsureSuperAdmin.php:30`). C'est même le cas le PLUS probable du
 * scénario « la session expire pendant un téléversement » : le cookie est encore là, c'est le
 * jeton qui ne vaut plus rien, donc le BFF ne voit pas d'erreur — il relaie celle du backend.
 *
 * On ne peut pas neutraliser tout 401 : celui de l'écran de connexion porte, lui, un message
 * correctement localisé (`__('auth.failed')` → « Ces identifiants ne correspondent pas. »), et
 * l'écraser serait une régression. On ne neutralise donc QUE cette sentinelle-là.
 */
const SENTINELLES_FRAMEWORK: Readonly<Record<string, CodeErreurApi>> = {
  // `AuthenticationException` — jamais passée par `lang/`, et recopiée à la main par
  // `app/Http/Middleware/EnsureSuperAdmin.php:30`.
  'Unauthenticated.': 'unauthenticated',
  // Le corps que Laravel rend en PRODUCTION pour toute 5xx non gérée (`APP_DEBUG=false`).
  // Sans cette entrée, la règle « la prose l'emporte » (cf. {@link ApiError.codeErreur}) ferait
  // afficher « Server Error » en anglais — le défaut même qu'on répare, une chaîne plus loin.
  'Server Error': 'server_error',
  // `ThrottleRequests`, constante du framework.
  'Too Many Attempts.': 'too_many_requests',
};

/**
 * Le `message` natif d'{@link ApiError} — `API error 401` — plus le gabarit d'{@link apiFetch}
 * (`API error 404: /public/properties/x`). Aucun des deux n'a jamais eu vocation à s'afficher,
 * et les deux l'ont fait : `{query.error.message}` était rendu tel quel dans six écrans.
 */
const FORME_TECHNIQUE = /^API error \d+/;

/** Le code de la sentinelle non traduisible que porte ce message, s'il en est une. */
function codeSentinelle(message: string): CodeErreurApi | undefined {
  return SENTINELLES_FRAMEWORK[message.trim()];
}

/** Le message est-il une sentinelle de framework, à ne jamais afficher telle quelle ? */
function estSentinelleFramework(message: string): boolean {
  return codeSentinelle(message) !== undefined;
}

/** Le `message` du corps, tel quel, sans jugement — `undefined` s'il n'y en a pas. */
function messageBrut(data: unknown): string | undefined {
  if (data && typeof data === 'object' && 'message' in data) {
    const brut = (data as { message?: unknown }).message;
    if (typeof brut === 'string' && brut.length > 0) return brut;
  }
  return undefined;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: unknown,
  ) {
    super(`API error ${status}`);
  }

  /**
   * Le code émis par un route handler BFF, quand c'en est un.
   *
   * `undefined` pour toute réponse venue de Laravel : le backend, lui, renvoie de la prose déjà
   * localisée (`Accept-Language` est forwardé par {@link apiRequest}), et c'est légitime.
   */
  get code(): CodeErreurBff | undefined {
    if (this.data && typeof this.data === 'object' && 'code' in this.data) {
      const brut = (this.data as { code?: unknown }).code;
      if (estCodeBff(brut)) return brut;
    }
    return undefined;
  }

  /**
   * **La prose DÉJÀ LOCALISÉE renvoyée par Laravel**, quand il y en a une.
   *
   * `undefined` dans les deux cas où il n'y a rien d'affichable : corps sans `message`, et
   * sentinelle anglaise du 401 — qui n'est traduite nulle part et ne doit jamais atteindre l'écran.
   */
  get proseServeur(): string | undefined {
    const brut = messageBrut(this.data);
    if (brut === undefined || estSentinelleFramework(brut)) return undefined;
    return brut;
  }

  /**
   * **Le code stable de cette erreur — une DONNÉE, à traduire au point de rendu.**
   *
   * `undefined` dans deux cas, et l'appelant les traite pareil (il prend son repli, ou
   * {@link proseServeur}) : quand Laravel a fourni de la prose déjà localisée, et quand le corps
   * ne dit **rien** d'exploitable — auquel cas le libellé métier de l'appelant est plus utile que
   * le générique `errors.api.unknown`.
   *
   * ```ts
   * const t = useTranslations();                    // ou `await getTranslations()` côté serveur
   * const texte = messageErreurApi(err, t, repli);  // fait la composition pour vous
   * ```
   */
  get codeErreur(): CodeErreurApi | undefined {
    const bff = this.code;
    if (bff) return bff;

    // ⚠️ L'ORDRE DES TROIS TESTS SUIVANTS EST MESURÉ, pas esthétique — chacun a un test qui le
    // fixe, et les intervertir en casse un.
    //
    // 1. **429 d'abord, AVANT la prose.** Le corps d'un 429 vient du limiteur de Laravel, jamais
    //    de `lang/` : c'est une constante du framework (« Too Many Attempts. »), au même titre que
    //    la sentinelle du 401. Et la limitation de débit n'a qu'un sens possible — l'application
    //    n'a rien de plus utile à dire que « trop de tentatives ».
    //    (`src/hooks/__tests__/useApiForm.test.tsx:24`)
    if (this.status === 429) return 'too_many_requests';

    // 2. **La prose ensuite, AVANT le code déduit du statut.** Un 500 portant « Panne serveur »
    //    doit afficher « Panne serveur », et non le générique « Le serveur a rencontré une
    //    erreur » : le message applicatif est plus précis que le statut.
    //    (`src/components/admin/roles/__tests__/DeleteRoleDialog.test.tsx:104`)
    const brut = messageBrut(this.data);
    if (brut !== undefined) return codeSentinelle(brut);

    // 3. Enfin seulement, le code déduit du statut — quand le serveur n'a rien dit d'affichable.
    if (this.status >= 500) return 'server_error';
    return undefined;
  }

  /**
   * Prose serveur affichable, ou `undefined` — **alias de {@link proseServeur}**.
   *
   * ⚠️ **Ce que cet accesseur ne fait PLUS, et pourquoi.** Il rendait autrefois un libellé pour
   * tous les cas, en traduisant lui-même les codes via un **traducteur rangé dans une variable de
   * module**, enregistré par `QueryProvider`. Deux défauts, tous deux mesurés :
   *
   * 1. `QueryProvider` est `'use client'`. Les 16 modules `'use server'` de `src/app/actions/`
   *    lisent `err.displayMessage` et renvoient le résultat au client pour affichage — sans que
   *    personne n'ait jamais enregistré quoi que ce soit dans LEUR processus. Un 401 y rendait
   *    donc la chaîne `errors.api.unauthenticated`, **la clé i18n brute, à l'écran**, sur le
   *    chemin de chaque soumission de formulaire.
   * 2. Même enregistré, un global de processus Node est **partagé entre requêtes concurrentes** :
   *    le server action d'un francophone aurait rendu la locale du dernier rendu SSR passé par ce
   *    worker.
   *
   * Le type est désormais `string | undefined`, et c'est le cœur du correctif : **il n'existe plus
   * aucune valeur de retour capable de porter une clé.** Les appelants de la forme
   * `err.displayMessage ?? t('…')` deviennent justes par construction — leur repli, jusqu'ici mort
   * (une clé est *truthy*), redevient vivant.
   *
   * ⚠️ **Cet accesseur n'a plus AUCUN lecteur de production** (mesuré : les seules occurrences de
   * `.displayMessage` hors commentaire sont dans les tests et dans le motif de la garde
   * `src/app/actions/__tests__/erreurs-traduites.test.ts`). Une version de ce docblock annonçait
   * « ~90 appelants » au présent, et le rapport de correctif « ~50 lecteurs restants » : les deux
   * décrivaient la population d'AVANT la conversion. Il ne subsiste donc que pour compatibilité —
   * le supprimer serait sans risque, et se compte en zéro site d'appel, pas en cinquante.
   *
   * Préférer {@link messageErreurApi}, qui compose code et prose avec le traducteur de l'appelant.
   */
  get displayMessage(): string | undefined {
    return this.proseServeur;
  }

  /**
   * Typed access to Laravel-style validation errors (`status === 422`).
   */
  get validationErrors(): Record<string, string[]> | undefined {
    if (
      this.status === 422 &&
      this.data &&
      typeof this.data === 'object' &&
      'errors' in this.data
    ) {
      const raw = (this.data as { errors?: unknown }).errors;
      if (raw && typeof raw === 'object') return raw as Record<string, string[]>;
    }
    return undefined;
  }
}

/**
 * Signature minimale d'un traducteur next-intl **à la racine** du dictionnaire.
 *
 * ⚠️ Racine, et non un espace de noms : les clés de {@link CLE_I18N_ERREUR_BFF} sont des chemins
 * absolus (`errors.api.unauthenticated`). Un composant qui tient déjà un
 * `useTranslations('agents.onboarding.kyc')` ne peut donc PAS s'en servir ici — il lui faut, en
 * plus, un `useTranslations()` sans argument.
 */
export type TraducteurRacine = (cle: string) => string;

/**
 * Traduit une erreur réseau en libellé affichable, dans la langue de l'utilisateur.
 *
 * C'est LA fonction à appeler depuis un composant : contrairement à
 * {@link ApiError.displayMessage}, elle rend l'anglais et le wolof.
 *
 * @param erreur  ce qu'a levé `fetch` / `apiRequest` / un `jsonOrThrow`.
 * @param t       un `useTranslations()` **sans argument** (racine du dictionnaire).
 * @param repli   libellé métier de l'appelant, déjà traduit, utilisé quand rien de plus précis
 *                n'est disponible — p. ex. « Une erreur est survenue. Réessayez. » de l'écran KYC.
 */
export function messageErreurApi(
  erreur: unknown,
  t: TraducteurRacine,
  repli: string,
): string {
  if (erreur instanceof ApiError) {
    const code = erreur.codeErreur;
    if (code) return t(CLE_I18N_ERREUR_API[code]);

    // Pas de code : Laravel a renvoyé de la prose déjà localisée — on la préfère au repli.
    return erreur.proseServeur ?? repli;
  }

  // `fetch` ne lève un `TypeError` que lorsque la requête n'a pas abouti du tout.
  if (erreur instanceof Error && erreur.name === 'TypeError') return t(CLE_I18N_ERREUR_API.network);

  if (erreur instanceof Error) {
    // Un `Error` NU sert ici de transport à un message DÉJÀ traduit : plusieurs hooks font
    // `throw new Error(res.message)` sur le résultat d'un server action, dont le `message` est
    // français (`src/hooks/usePropertyReviews.ts:40`, `NotificationPreferencesMatrix.tsx:98`).
    // On le laisse donc passer — SAUF les deux formes techniques qui ne doivent jamais s'afficher.
    const brut = erreur.message.trim();
    if (brut.length > 0 && !FORME_TECHNIQUE.test(brut) && !estSentinelleFramework(brut)) return brut;
  }

  return repli;
}

/**
 * Même chose, à partir d'un corps de réponse JSON déjà lu — pour les appelants qui font un `fetch`
 * nu vers le BFF et n'ont pas construit d'{@link ApiError}.
 *
 * Un route handler de `src/app/api/**` **proxifie la réponse de Laravel telle quelle** dès que la
 * requête sort de son propre chemin d'erreur. Le corps peut donc porter, au choix :
 *
 * - un `code` que CE dépôt a émis → on le traduit ;
 * - un `message` que LARAVEL a émis → on l'affiche, il est déjà localisé (`Accept-Language`) ;
 * - ni l'un ni l'autre → le repli de l'appelant.
 */
export function messageCorpsErreurBff(
  corps: unknown,
  t: TraducteurRacine,
  repli: string,
): string {
  if (corps && typeof corps === 'object') {
    if ('code' in corps) {
      const brut = (corps as { code?: unknown }).code;
      if (estCodeBff(brut)) return t(CLE_I18N_ERREUR_BFF[brut]);
    }
    if ('message' in corps) {
      const brut = (corps as { message?: unknown }).message;
      if (typeof brut === 'string' && brut.length > 0) {
        const sentinelle = codeSentinelle(brut);
        if (sentinelle) return t(CLE_I18N_ERREUR_API[sentinelle]);
        return brut;
      }
    }
  }
  return repli;
}

/**
 * When `apiRequest` runs server-side (RSC, server actions, route handlers),
 * the outgoing fetch originates from the Next.js process — not the visitor's
 * browser — so Laravel sees a single shared origin IP. Without forwarding,
 * per-IP rate limiters and `Request::ip()` collapse onto one bucket for all
 * visitors. We read the inbound visitor IP from `next/headers` and propagate
 * it via `X-Forwarded-For`, paired with `TrustProxies` configured on the API.
 *
 * Returns `undefined` when there is no resolvable visitor (client-side calls,
 * out-of-request execution like build-time, or no upstream proxy header).
 */
async function resolveVisitorIp(): Promise<string | undefined> {
  if (typeof window !== 'undefined') return undefined;
  try {
    const { headers } = await import('next/headers');
    const incoming = await headers();
    const xff = incoming.get('x-forwarded-for');
    if (xff) {
      // XFF is a comma-separated list — the left-most entry is the original
      // client. Trim whitespace which is permitted by RFC 7239-style proxies.
      const first = xff.split(',')[0]?.trim();
      if (first) return first;
    }
    const xri = incoming.get('x-real-ip')?.trim();
    return xri && xri.length > 0 ? xri : undefined;
  } catch {
    return undefined;
  }
}

export async function apiRequest<T>(
  path: string,
  { method = 'GET', body, token, headers = {}, formData = false, locale, signal, activeProfileId }: RequestOptions = {},
): Promise<T> {
  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...headers,
  };

  if (!formData) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  if (token) {
    requestHeaders['Authorization'] = `Bearer ${token}`;
  }

  const requestLocale = clientLocaleCookie() ?? locale;
  if (requestLocale && !requestHeaders['Accept-Language']) {
    requestHeaders['Accept-Language'] = requestLocale;
  }

  if (activeProfileId && !requestHeaders['X-Active-Profile-Hint']) {
    requestHeaders['X-Active-Profile-Hint'] = activeProfileId;
  }

  if (!requestHeaders['X-Forwarded-For']) {
    const visitorIp = await resolveVisitorIp();
    if (visitorIp) {
      requestHeaders['X-Forwarded-For'] = visitorIp;
    }
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: requestHeaders,
    body: body !== undefined
      ? formData ? (body as BodyInit) : JSON.stringify(body)
      : undefined,
    signal,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, data);
  }

  return data as T;
}

/**
 * Serialize spatie/laravel-query-builder params. Prefer this over manual
 * `URLSearchParams` so every caller gets the canonical shape:
 *
 *   ?filter[status]=active&include=owner&fields[properties]=id,title&sort=-created_at
 *
 * See CLAUDE.md → "API — Conventions frontend" and
 * `docs/spatie-query-builder.md`.
 */
export function buildQueryString(params: SpatieQueryParams): string {
  const qs = new URLSearchParams();

  if (params.fields) {
    for (const [table, cols] of Object.entries(params.fields)) {
      const value: string = Array.isArray(cols)
        ? (cols as readonly string[]).join(',')
        : (cols as string);
      if (value) qs.set(`fields[${table}]`, value);
    }
  }

  if (params.filter) {
    for (const [key, value] of Object.entries(params.filter)) {
      if (value === null || value === undefined || value === '') continue;
      if (Array.isArray(value)) {
        qs.set(`filter[${key}]`, (value as readonly (string | number)[]).join(','));
      } else {
        qs.set(`filter[${key}]`, String(value));
      }
    }
  }

  if (params.include) {
    const value: string = Array.isArray(params.include)
      ? (params.include as readonly string[]).join(',')
      : (params.include as string);
    if (value) qs.set('include', value);
  }

  if (params.sort) {
    const value: string = Array.isArray(params.sort)
      ? (params.sort as readonly string[]).join(',')
      : (params.sort as string);
    if (value) qs.set('sort', value);
  }

  if (typeof params.page === 'number') qs.set('page', String(params.page));
  if (typeof params.per_page === 'number') qs.set('per_page', String(params.per_page));

  if (params.extra) {
    for (const [key, value] of Object.entries(params.extra)) {
      if (value === null || value === undefined || value === '') continue;
      qs.set(key, String(value));
    }
  }

  return qs.toString();
}
