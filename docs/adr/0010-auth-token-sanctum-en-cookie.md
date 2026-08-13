# ADR-0010 — Authentification par token Sanctum porté par un cookie httpOnly, pas le mode SPA stateful

- **Statut** : Accepté
- **Date de la décision** : 2026-04 · **Rédigé rétroactivement** : 2026-08-12

## Contexte

Laravel Sanctum offre deux modes. Le mode **SPA stateful** s'appuie sur la session Laravel et les
cookies `XSRF` : le front appelle `/sanctum/csrf-cookie`, puis les requêtes sont authentifiées par
session. Le mode **token API** émet un Bearer que le client stocke et renvoie.

Le mode SPA est le choix par défaut pour un front sur le même domaine. Il suppose un client qui
tourne **dans le navigateur**.

Or Next.js en App Router rend l'essentiel des pages **côté serveur** : 82 des 111 pages sont des RSC.
Une garde de route (`src/proxy.ts`) et des layouts serveur doivent savoir, **avant tout rendu**, si
la personne est authentifiée. Un cookie de session Laravel sur un autre domaine, lisible seulement
par le navigateur, ne leur sert à rien.

## Décision

**Authentification par token Sanctum (`createToken()->plainTextToken`), stocké dans un cookie
`auth_token` httpOnly, sameSite lax, `secure` en production, 7 jours.**

Le cookie est posé par un route handler Next (`POST /api/auth/set-token`), jamais par Laravel. Le
serveur Next le lit et le transmet en `Authorization: Bearer` — c'est le rôle des **31 route
handlers BFF** de `src/app/api/`.

## Conséquences

**Le cookie est httpOnly : aucun JavaScript de page ne lit le token.** C'est la propriété
principale — un XSS ne l'exfiltre pas. Le prix est que **tout appel authentifié doit passer par le
serveur Next**, d'où la couche BFF.

**Le mode stateful reste configuré et inutilisé.** `config/sanctum.php` conserve son bloc `stateful`
et `guard => ['web']`. Ce n'est pas une erreur, c'est du bruit — et du bruit qui suggère au lecteur
un mécanisme qui n'opère pas.

**Le middleware doit rattraper le user à la main.** Sur les routes à authentification *optionnelle*,
`ResolveActiveProfile` résout Sanctum lui-même (`$request->user('sanctum')` puis `Auth::setUser()`)
parce qu'aucun middleware d'auth n'est passé avant lui
([ADR-0004](0004-profil-actif-resolu-par-middleware.md)).

**Le rate limiting paie la même contrainte.** `visitorRateLimitKey()` résout le token *directement*
via `PersonalAccessToken::findToken()` : les limiteurs tournent avant toute résolution d'identité.

**Deux effets de bord mesurés :**

- Le garde `src/proxy.ts` **ne couvre pas `/super-admin/*`** — cette surface ne tient que par la
  défense en profondeur des layouts serveur.
- Les cookies sont **read-only en RSC** : un 401 rencontré pendant un rendu serveur ne peut pas
  effacer le cookie. D'où la redirection vers le route handler `/api/auth/session-expired`, dont
  c'est l'unique raison d'être.

**Un piège d'origine.** L'API annonce `APP_URL=http://localhost:8002` et
`SANCTUM_STATEFUL_DOMAINS=localhost:3000`, le front pointe sur `127.0.0.1:8002`. **Du point de vue
des cookies, `localhost` et `127.0.0.1` sont deux origines distinctes** (ardoise D-25).

## Application

- `app/Http/Controllers/Auth/AuthController.php:87` — l'émission du token.
- `src/lib/constants.ts:1` — `AUTH_COOKIE_NAME = 'auth_token'`.
- `src/app/api/auth/set-token/route.ts:14-31` — la pose du cookie.
- `src/proxy.ts:4-26` — le garde de route (Next 16 a renommé `middleware.ts` → `proxy.ts`).
- `src/app/actions/auth.ts:77-97` — `getMeAction()`, mémoïsé par requête via `cache()`.
- `app/Providers/AppServiceProvider.php:269-322` — les limiteurs nommés et `visitorRateLimitKey()`.
