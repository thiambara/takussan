---
id: TCK-998
title: "Une garde de Repo CI confronte chaque appel du front (chemin et verbe) aux routes de l'API, lues par route:list"
status: done
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-45--contrat-front--api--chemins-verbes-clés-de-réponse"
tags: [infra, ci, garde, front, api, pistes]
---

## Contexte

Réf : **P45.01** du fichier de pistes. Quatre routes absentes ont vécu dans le code du front
(`PATCH /api/users/me`, `generate-schedule`, les pièces jointes de la messagerie, les documents de
la fiche client). Chacune a été corrigée avec un test propre à son fichier, et aucune garde ne
tenait la famille : un appel vers une route qui n'existe pas ne casse ni `tsc`, ni ESLint, ni le
build, il rend un 404 ou un 405 à l'exécution.

L'implémenteur avait classé la piste en chemin fermé : la voie écrite (un test PHPUnit qui lit
`../takussan-web/src`) exigeait d'élargir `PERIMETRES.api` de `scripts/ci-attestation.mjs` à
`takussan-web/src` et d'ouvrir les `paths` d'`api-ci.yml` au front. Mesuré le 2026-10-19 :
`lint-and-test` dure 19 à 36 min (médiane 31, 25 runs verts des 18 et 19 octobre), et environ une
PR de code sur cinq ne touche que le front (8 sur 43 vers `pre-dev`, 11 sur 59 vers `dev`). Chacune
aurait rejoué toute la suite de l'API.

**Décision du porteur (2026-10-19)** : voie B, une garde Node de Repo CI alimentée par
`php artisan route:list --json`, sans toucher l'attestation ni ADR-0063. `route:list` ne lit ni la
base, ni Redis, ni Meilisearch (mesuré : 687 routes en 1 s, environnement vide, sans `.env`).

## Objectif

Un appel du front vers un chemin ou un verbe que ni l'API ni le BFF ne servent rougit en CI, sur
toute PR qui touche `takussan-web/src`, les routes ou le code de l'API.

## Delta à produire

- [x] `scripts/check-front-routes.mjs` : lit `route:list --json` (lancé depuis `takussan-api/`,
      environnement neutre) et les route handlers de `takussan-web/src/app/api` ; confronte les
      littéraux `/api/…` de `takussan-web/src` (hors tests) et le premier argument des fonctions
      qui ajoutent `/api` (`apiFetch`, `urlApiPublique`, `urlApiServeur`, `relayerVersApi`).
      Traite les relais à joker par une table confrontée au source des handlers, le préfixe
      d'`apiFetch`, les segments variables, et la cible BFF ou Laravel selon l'appelant. Échoue
      si PHP ou `vendor/` manque.
- [x] `.github/workflows/repo-ci.yml`, job `guards` : PHP 8.4 (mêmes extensions et même clé de
      cache composer qu'`api-ci.yml`), `composer install`, puis la garde ; `takussan-api/bootstrap/**`
      ajouté aux déclencheurs (il enregistre les fichiers de routes et le préfixe `api`).
- [x] Les commentaires « le job `guards` n'a pas PHP » de `check-cache-headers-auth.mjs` et
      `check-notification-codes.mjs` mis à jour.

## Critères d'acceptation

- [x] AC1 — Sur l'arbre actuel, la garde est verte : 648 appels jugés, une exception justifiée.
- [x] AC2 — Réintroduire `PATCH /api/users/me` dans `src/app/actions/locale.ts` la fait rougir, en
      nommant le fichier, la ligne et le verbe ; remis en place, elle est verte.
- [x] AC3 — Un relais `[...path]` neuf absent de sa table, un `vendor/` absent ou un `php`
      introuvable la font échouer, jamais passer.

## Hypothèses (mode sans humain)

- Un `fetch('/api/…')` relatif et un `redirect('/api/…')` visent le BFF ; `apiRequest`,
  `useApiQuery` et les fonctions qui ajoutent `/api` visent l'API ; un littéral hors de ces appels
  vaut par l'un ou l'autre.
- Un segment variable vaut n'importe quel segment ; un chemin dont le premier segment est variable
  n'est que compté.

## Hors périmètre

- Les clés de réponse lues par le front (le reste de l'angle 45).
- Faire lire `route:list` à `check-cache-headers-auth.mjs`, qui le pourrait désormais.

## Notes d'implémentation

- Garde lancée sur `pre-dev` 1c1fe5f0f : 687 formes de routes, 37 route handlers dont 6 relais à
  joker, 648 appels jugés, 8 au premier segment variable. Premier passage : 5 écarts, tous des faux
  positifs. Quatre venaient d'options rendues par une fonction (`apiFetch(chemin, post(corps))`,
  lu comme un GET) : un appel dont les options ne sont pas un objet littéral n'a plus de verbe
  jugé. Le cinquième est la base du relais d'impersonation (`IMPERSONATION_RELAY`), une constante
  jamais appelée nue : c'est la seule exception.
- Ablations, chacune remise en place, garde verte ensuite :
  - `apiRequest('/api/users/me', { method: 'PATCH' })` dans `locale.ts` →
    `locale.ts:44 PATCH /api/users/me — aucune route de l'API` ;
  - `method: 'PUT'` sur le remboursement de caution → `PUT non servi (POST, GET : …)` ;
  - `fetch('/api/leases')` relatif → `aucune route du BFF` (l'API la sert, le navigateur ne la
    joint pas) ;
  - `lire('/api/super-admin/boost-produits')` → aucune route, le relais `super-admin` déplié vers
    `api/admin/…` ;
  - `apiFetch('/api/public/…')` → `/api/api/public/… — aucune route de l'API` (la première version
    le laissait passer, corrigé) ; `apiRequest('/me')` sans préfixe → `PATCH /me — aucune route` ;
  - un `src/app/api/essai/[...path]/route.ts` neuf → absent de `RELAIS` ;
  - `vendor/` renommé → échec nommé ; `PATH` sans `php` → échec nommé.
