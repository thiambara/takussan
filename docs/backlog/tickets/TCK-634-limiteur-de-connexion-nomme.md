---
id: TCK-634
title: "Se connecter : la page de connexion épuise elle-même le quota de connexion (429 à la première tentative)"
status: todo
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-12
updated: 2026-10-12
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
  models: []
tags: [back, auth, rate-limit, oauth, production]
---

## Objectif utilisateur

- **Toute personne qui se connecte par e-mail et mot de passe** : sa première tentative est jugée
  sur son mot de passe, jamais refusée par un « trop de tentatives » qu'elle n'a pas faites.

## Contrat de données

Aucune donnée neuve. Deux routes existantes, dans `takussan-api/routes/api/auth.php` :

- `POST /api/auth/login`, sous `throttle:5,10` (ligne 29) ;
- le groupe `auth/oauth/*` (dont `GET /api/auth/oauth/providers`), sous `throttle:60,1`
  (ligne 149).

**Le défaut, relevé le 2026-10-12 pendant l'essai au navigateur de TCK-633.** Un `throttle`
numérique sans préfixe compte sous la signature de la requête, `sha1(domaine|ip)` pour un
visiteur. Les deux limiteurs partagent donc **la même clé** : chaque appel à
`oauth/providers` consomme le quota de connexion (5 par 10 minutes). La page de connexion appelle
`oauth/providers` plusieurs fois à son affichage (`src/lib/auth.ts`,
`src/lib/connexion-telephone.ts` ; 8 appels relevés en développement), et la connexion qui suit
reçoit **429**.

Reproduit en local, et contre-épreuve :

```text
6 × GET /api/auth/oauth/providers, puis POST /api/auth/login (mauvais mot de passe) → 429
POST /api/auth/login seul (mauvais mot de passe), compteur vidé                → 422
```

Présent depuis avril 2026, donc en préproduction et dans tout environnement qui sert l'API.

## Direction UX / Artistique

Sans objet : ticket backend.

## Contraintes strictes (métier)

- La borne de la connexion reste **5 tentatives par 10 minutes et par IP**, comptée sur les seules
  tentatives de connexion. Le verrou de compte (`docs/features.md` §2.1) n'est pas touché.
- La borne d'`auth/oauth/*` reste **60 par minute et par IP**, sur son propre compteur. Le
  `throttle:10,1,oauth-2fa` de `POST /auth/oauth/2fa` garde son préfixe.
- Aucune route ne change de chemin, de nom ni de code de réponse hors du cas corrigé : à prouver par
  `php artisan route:list` avant et après.

## Delta à produire

- [ ] `AppServiceProvider::bootRateLimiters()` : deux limiteurs nommés, à côté d'`auth-register` et
      d'`auth-password` :
      `auth-login` → `Limit::perMinutes(10, 5)->by('login-ip:'.$request->ip())` ;
      `auth-oauth` → `Limit::perMinute(60)->by('oauth-ip:'.$request->ip())`.
- [ ] `routes/api/auth.php` : `POST /login` passe à `throttle:auth-login`, le groupe
      `auth/oauth` à `throttle:auth-oauth`.
- [ ] Recenser les autres `throttle:N,M` **sans préfixe** de `routes/api/` sur des routes
      publiques : chacun partage la même clé que les deux ci-dessus. Les nommer aussi, ou écrire
      dans ce ticket pourquoi un partage est voulu.
- [ ] Test `tests/Feature/Auth/LoginRateLimitIsolationTest.php` (étend `Tests\ApiTestCase`) :
      1. dix `GET /api/auth/oauth/providers`, puis `POST /api/auth/login` avec un mauvais mot de
         passe → **422**, pas 429 ;
      2. six `POST /api/auth/login` avec un mauvais mot de passe → la sixième rend **429** (la
         borne de connexion tient toujours) ;
      3. soixante et un `GET /api/auth/oauth/providers` → le dernier rend **429** (la borne
         d'OAuth tient toujours).
- [ ] Ablation : le cas 1 rougit quand le groupe OAuth repasse à `throttle:60,1`.

## Critères d'acceptation

- [ ] AC1 — Après l'affichage de la page de connexion (autant d'appels à `oauth/providers` qu'elle
      en fait), une première connexion au mauvais mot de passe rend 422, et au bon mot de passe 200.
      Prouvé au navigateur en local, compteurs vidés au départ.
- [ ] AC2 — La sixième tentative de connexion en 10 minutes depuis une même IP rend 429, quel que
      soit le nombre d'appels OAuth intercalés.
- [ ] AC3 — `oauth/*` rend 429 au-delà de 60 appels par minute, quel que soit le nombre de
      tentatives de connexion intercalées.
- [ ] AC4 — `php artisan route:list --path=api/auth` est identique avant et après, middlewares
      `throttle` exceptés.

## Hors périmètre

- Le nombre d'appels à `oauth/providers` faits par la page de connexion : à réduire si l'on veut,
  mais le corriger seul laisserait la clé partagée, et le prochain appel public ajouté au parcours
  recréerait la panne.
- Une borne de connexion par adresse e-mail en plus de l'IP : le verrou de compte la tient déjà.
- Les limiteurs des routes authentifiées (clé par utilisateur, non partagée avec un visiteur).

## Notes d'implémentation

_(à remplir par implementing-specs)_
