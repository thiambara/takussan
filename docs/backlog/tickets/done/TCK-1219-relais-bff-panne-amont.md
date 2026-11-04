---
id: TCK-1219
title: "Relais BFF : une API injoignable ou lente rend un 502 ou 504 JSON avec un code, et l'abandon d'une lecture remonte à l'API"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1215]
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-79--appels-du-serveur-next-vers-lapi-sans-délai"
tags: [front, bff, resilience, pistes]
---

## Contexte

Réf : **P79.04** du fichier de pistes, `validé`.

`relayerVersApi` (`src/lib/relais-api.ts`) et les route handlers de `src/app/api/**` qui font un
`fetch` direct ne posent ni délai ni `catch`, et ne transmettent pas l'abandon du navigateur
(`request.signal`). Une API arrêtée fait lever le handler : le navigateur reçoit la 500 de Next,
sans le `code` que lit `messageCorpsErreurBff`.

## Décision du porteur

« validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket »

Critère accordé : V7. Le délégué avait relevé V2 (le relais d'impersonation passe par
`relayerVersApi`) avant la validation, en le soumettant au porteur : il est tenu pour accordé.

### Choix de l'implémenteur

- **Statut et code** : **502** `{ code: 'upstream_unavailable' }` sur un rejet de `fetch`, **504**
  `{ code: 'upstream_timeout' }` quand la cause est le délai, comme le recommande le délégué
  (« 504 quand la cause est un délai »). Les deux codes entrent dans `CODES_ERREUR_BFF` et se
  traduisent par le libellé **existant** `errors.api.serverError` : aucun texte neuf.
- **`request.signal` n'est transmis qu'aux `GET` et `HEAD`** (recommandation du délégué : une
  mutation abandonnée en vol peut être appliquée par l'API sans que l'appelant le sache).
- **Délai** : celui de TCK-1215 (30 s), **90 s** pour l'export (`export/[entity]`), les trois
  téléversements KYC et le téléchargement d'un export de données (`data-exports/[id]/download`),
  comme la piste le demande. Il borne l'attente des **en-têtes** de la réponse, comme le
  `headersTimeout` d'undici qu'il remplace : un fichier qui se télécharge n'est pas coupé en route.
- **Patron** : un `fetchVersApi` commun, qui rend la réponse 502/504 au lieu de lever ; les relais
  qui recopient la réponse amont la recopient donc telle quelle. `relayerVersApi` l'emploie, et
  les quinze relais à `fetch` direct sans `catch` aussi.

## Reste à faire

Le délai des quatre relais à `fetch` direct qui ont déjà un `catch` (`auth/logout`,
`impersonation/start`, `stop`, `current`) : ils rendent déjà une réponse sur un rejet, et le
passage ne touche pas leur chemin (V2). `maintenance/status` relève de P79.06 (TCK-1221).

## Objectif

Une API injoignable ou figée donne au navigateur une réponse JSON portant un code BFF, sous la
borne, au lieu d'une 500 de Next ou d'une attente de 300 s.

## Contrat de données

Deux codes BFF neufs : `upstream_unavailable` (502), `upstream_timeout` (504).

## Delta à produire

- [x] `src/lib/api.ts` : les deux codes, traduits par `errors.api.serverError`.
- [x] `src/lib/relais-api.ts` : `fetchVersApi` (délai, signal des lectures, réponse 502/504) ;
      `relayerVersApi` l'emploie.
- [x] Les quinze route handlers à `fetch` direct sans `catch` l'emploient.
- [x] Tests de `fetchVersApi` et de `relayerVersApi` : `fetch` qui rejette → 502 et son code ;
      délai → 504 ; abandon d'un `GET` transmis, d'un `POST` non.

## Critères d'acceptation

- [x] AC1 — `relayerVersApi` rend 502 `{ code: 'upstream_unavailable' }` quand `fetch` rejette.
- [x] AC2 — Une API figée rend 504 `{ code: 'upstream_timeout' }` au délai.
- [x] AC3 — L'abandon du navigateur abandonne l'appel amont d'un `GET`, pas d'un `POST`.
- [x] AC4 — Aucun handler de `src/app/api/**` à `fetch` direct sans `catch` ne reste, hors `sante`.

## Hors périmètre

- La mise en page racine (TCK-1217), `apiFetch` et `apiRequest` (TCK-1215).

## Notes d'implémentation

- Le délai est une minuterie levée à l'arrivée des en-têtes, pas `AbortSignal.timeout` : celui-ci
  couperait aussi le corps, donc un export ou un téléchargement long en cours de transfert.
- La panne devient une `Response` JSON plutôt qu'une exception : les quinze relais recopient déjà
  statut, corps et `content-type` de l'amont, et n'ont changé que d'une ligne chacun.
- AC4 est tenu par un test statique (`relais-panne-amont.test.ts`), avec `maintenance/status` en
  exception jusqu'à TCK-1221.
- Ablation : `relais-api.ts`, `api.ts` et les quinze handlers rendus à `HEAD`, test gardé → 10/10
  rouges ; correctif remis → 10/10 verts, 262/262 sur les tests de `src/app/api` touchés et
  `api-erreurs-bff`.
