---
id: TCK-3009
title: "Un client BFF : une primitive pour les appels du front vers ses route handlers, qui sérialise, lève ApiError et remplace les jsonOrThrow recopiés"
status: todo
phase: P2
family: front
estimate: S
wave: 99
created: 2026-11-27
updated: 2026-11-27
depends_on: [TCK-3008]
blocks: [TCK-3010]
spec_refs:
  features: []
  models: []
tags: [front, bff, super-admin, architecture]
---

## Objectif utilisateur

Un appel du front vers un de ses route handlers (console super-admin, radar, `/me`…) se comporte toujours de la même façon : mêmes paramètres, même erreur, même session.

## Contrat de données

Relevé du 2026-11-27 (`dev` 4e3a929f7). Deux familles visent deux serveurs différents :

- `apiRequest('/api/…')` → Laravel (`lib/api.ts:815-902` : Bearer, profil actif, XFF, `X-Request-Id`, relais d'impersonation) ;
- `fetch('/api/…')` relatif → les route handlers Next (BFF). Raison : le relais `/api/super-admin/[...path]` renomme vers `/admin` (TCK-145) et garde le jeton de l'**opérateur** pendant une impersonation (ADR-0055).

La famille BFF recopie la construction des paramètres (`URLSearchParams` à la main, ex. `lib/queries/super-admin.ts:110-121`), `credentials`, `if (!res.ok)` et `jsonOrThrow` (`lib/queries/super-admin-coque.ts:26`, `components/boost/admin/api.ts:53`, avec ses propres `lire`/`ecrire` :58-69). ~34 fichiers hors tests.

## Contraintes strictes (métier)

- La primitive est un **module frère** d'`apiRequest`, pas une option : elle n'envoie ni Bearer, ni profil actif, ni en-tête d'identité ; même origine, cookie.
- Elle sérialise par `buildQueryString` (sparse fieldsets, ADR-0006) et lève toujours `ApiError(status, data)` (forme de TCK-3008).
- Le préfixe `/api` reste écrit par l'appelant (décision séparée, hors ticket) ; `cheminApi` reste utilisable.
- Les chemins `impersonate` restent bloqués par le relais (inchangé).

## Delta à produire

- [ ] Intention : une primitive BFF (GET/POST/PATCH/DELETE, paramètres, corps JSON ou FormData, signal)
- [ ] Les fonctions de `lib/queries/super-admin*.ts`, `radar.ts`, `components/boost/admin/api.ts` et les autres appels `fetch('/api/…')` relatifs hors tests passent par elle ; les deux `jsonOrThrow` disparaissent
- [ ] Tests : la primitive en unitaire (paramètres, erreur, credentials) ; le contrat de requêtes TCK-1800 reste vert

## Critères d'acceptation

- [ ] AC1 — `grep -rn "jsonOrThrow" src | grep -v __tests__` est vide.
- [ ] AC2 — `grep -rln "fetch(\`/api\|fetch('/api\|fetch(\"/api" src | grep -v __tests__` ne rend plus que la primitive (ou des exceptions documentées dans son en-tête, avec leur raison).
- [ ] AC3 — `tsc --noEmit`, lint et les tests touchés sont verts.

## Hors périmètre

- Qui écrit le préfixe `/api` dans les ~300 appels `apiRequest`.

## Notes d'implémentation
