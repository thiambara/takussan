---
id: TCK-950
title: "Le front n'annonce plus `X-Powered-By`, et chaque appel serveur d'`apiRequest` porte un `X-Request-Id` que l'API et les `console.error` du front écrivent tous deux"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-44--front-en-conteneur--healthcheck-de-takussan-web-preview-journaux-next"
tags: [front, journaux, observabilite, securite, pistes]
---

## Contexte

Piste P44.03 (angle 44), « Petites améliorations ». Deux des trois constats sont traités ici :

- `X-Powered-By: Next.js` est émis sur chaque réponse : `next.config.ts` ne pose pas
  `poweredByHeader: false`.
- Aucun identifiant ne relie le front à l'API. L'API reprend un `X-Request-Id` entrant sûr et
  l'écrit dans chacun de ses journaux (`ShareRequestLogContext`, TCK-774), mais le front n'en envoie
  aucun : une ligne `console.error` du journal Next ne se relie à aucune ligne de l'API.

Décision du porteur (ligne Statut de la piste), recopiée mot pour mot :

> porteur (2026-10-18) : traité hors agents, en session : `poweredByHeader: false` et un `X-Request-Id` par requête ; la sonde sans Node, mesurée à part

## Objectif utilisateur

Une erreur du front se relie, par son identifiant, à la requête de l'API qui l'a causée. Le serveur
n'annonce plus sa pile.

## Delta à produire

- `takussan-web/next.config.ts` : `poweredByHeader: false`.
- `takussan-web/src/lib/api.ts` :
  - `apiRequest`, côté serveur seulement, tire un `X-Request-Id` par appel (`crypto.randomUUID()`,
    dans le motif que l'API accepte, `^[A-Za-z0-9._-]{1,64}$`) et l'envoie, sauf si l'appelant en
    pose un.
  - `ApiError` porte `requestId` (propriété propre, absente quand il n'y en a pas). Tout
    `console.error('[…]', err)` du serveur Next l'écrit donc, `util.inspect` listant les propriétés
    propres de l'erreur.
- `deploy/takussan/smoke-web.sh` : rougit si `/fr` porte `X-Powered-By`.

## Critères d'acceptation

- [x] **AC1** — `next.config.ts` pose `poweredByHeader: false`. *Mesuré :
      `src/lib/__tests__/next-config.en-tetes.test.ts` vert ; **ablation** : la ligne retirée → rouge ;
      restaurée par `cp`, `md5` identique.*
- [x] **AC2** — Côté serveur, chaque appel d'`apiRequest` envoie un `X-Request-Id` que l'API accepte,
      différent d'un appel à l'autre, et garde celui que l'appelant pose. *Mesuré :
      `src/lib/__tests__/api.identifiant-de-requete.test.ts`, 3 tests verts ; **ablation** : la ligne
      `requestHeaders['X-Request-Id'] = crypto.randomUUID()` retirée → 2 rouges ; restaurée, `md5`
      identique.*
- [x] **AC3** — L'`ApiError` levée porte l'identifiant envoyé, et `util.inspect(err)` (ce qu'écrit
      `console.error` sous Node) le contient. *Mesuré : même fichier, même ablation.*
- [x] **AC4** — Dans le navigateur, aucun `X-Request-Id` n'est envoyé, et l'erreur n'en porte pas.
      *Mesuré : `api.identifiant-de-requete.navigateur.test.ts` vert ; **ablation** : la garde
      `typeof window === 'undefined'` retirée → rouge ; restaurée, `md5` identique.*
- [x] **AC5** — Rien d'autre ne bouge. *Mesuré : `npx vitest run src/lib/__tests__ src/app/api` →
      83 fichiers, 1 203 tests verts ; `src/app/actions src/lib/queries src/lib/access` → 61
      fichiers, 538 verts ; les 13 fichiers en environnement Node qui assertent des en-têtes → 125 tests verts ;
      `eslint` des fichiers touchés → 0.*

## Hors périmètre

- **La sonde sans Node** (le `HEALTHCHECK` lance un Node entier toutes les 15 s, 59 Mo de RSS sur
  le poste) : mesurée à part, décision du porteur. Le coût dans l'image Linux reste à relever.
- **`apiFetch`** (les lectures publiques) ne reçoit pas d'identifiant : ses appels sont mis en cache
  de données (`next: { revalidate }`) et un en-tête tiré par appel entrerait dans la clé du cache,
  qui ne servirait plus jamais. La décision vise `apiRequest`.
- Les `fetch` bruts des route handlers (`enTetesServeurAmont`) : même raison pour ceux qui sont
  partagés ; à ouvrir à part si le besoin se montre.
- Le journal du front sur une dizaine de lignes par erreur (format structuré) : le troisième
  constat de la piste, qui demande un choix.

## Notes d'implémentation

- Re-mesuré le 2026-10-18 : `grep poweredByHeader next.config.ts` → rien ;
  `grep -rIn -i x-request-id takussan-web/src` → rien ; `ShareRequestLogContext::INCOMING_ID` =
  `/^[A-Za-z0-9._-]{1,64}$/`. Le constat tient.
- L'identifiant est tiré **par appel** à l'API, et non par requête entrante : une ligne du front
  désigne ainsi une seule requête de l'API.
- **Effet sur la déduplication de `fetch` par Next** (vérification adverse du 2026-10-18), lu et
  non mesuré : pendant un rendu serveur, Next fusionne deux `fetch` GET identiques par une clé qui
  contient **tous** les en-têtes sauf `traceparent` et `tracestate`
  (`node_modules/next/dist/server/lib/dedupe-fetch.js:61-82`, `generateCacheKey`). Un
  `X-Request-Id` tiré par appel rend chaque clé unique : deux `apiRequest` GET identiques d'un même
  rendu partent désormais deux fois à l'API. Si un double appel se montre, le mémoïser par React
  `cache()` au niveau de la fonction de requête, plutôt que retirer l'identifiant. La mesure demande
  un rendu serveur réel (`React.cache` ne mémoïse que sous la condition `react-server`, dans une
  requête) : non faite.
- `declare public readonly requestId?: string` : sans `declare`, la cible ES2022 définirait la
  propriété à `undefined` sur toute `ApiError`, et `console.error` écrirait `requestId: undefined`.
