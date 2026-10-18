---
id: TCK-894
title: "Relais BFF : chemin serveur, IP et langue du visiteur sur tous les relais"
status: doing
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#22-relais-joignent-lapi-en-fetch-nu-par-son-url-publique-sans-la-langue-ni-lip-du-visiteur-que-pose-apirequest"
tags: [front, bff, i18n, pistes]
---

## Contexte

Réf : **P41.02** du fichier de pistes, `validé` (V5 accordé).

Les relais de `src/app/api/` bâtissaient l'URL de l'API sur `origineApi()`, l'origine publique,
au lieu du chemin serveur (`urlApiServeur()`, `API_INTERNAL_URL` quand elle est posée), et
n'envoyaient ni l'IP du visiteur, ni `accept-language` : le `fetch` de Node pose alors
`accept-language: *`, que `SetLocaleMiddleware` ne retient pas, et l'API répond dans la langue de
`preferred_language` plutôt que dans celle de la page. TCK-893 (P41.03) a fait passer les six
relais `forward()` par `relayerVersApi()` ; ce ticket traite les quinze autres et pose la garde.

## Décision du porteur

validé — les 22 relais passent par `urlApiServeur()` et `enTetesServeurAmont()` et relaient `accept-language` du navigateur ; une garde statique refuse `origineApi()` sous `src/app/api/` ; `API_INTERNAL_URL` reste à poser par le porteur

## Objectif utilisateur

Un utilisateur lit les réponses de l'API dans la langue de la page, et l'API voit son IP plutôt
que celle du serveur Next.

## Delta à produire

- [x] `enTetesDuRelais(request)` dans `src/lib/relais-api.ts` : `enTetesServeurAmont()` plus
  `accept-language` de la requête ; `relayerVersApi()` s'en sert.
- [x] Les quinze relais qui restaient sur `origineApi()` passent par `urlApiServeur()` et
  `enTetesDuRelais()`.
- [x] Garde statique (vitest) : aucun `route.ts` de `src/app/api/` n'appelle `origineApi()`.
- [x] Test : chaque relais, `API_INTERNAL_URL` posée, joint l'API par elle, avec la langue et
  l'IP du visiteur.

## Critères d'acceptation

- [x] AC1 — Aucun `route.ts` sous `src/app/api/` n'appelle `origineApi()`, et la garde rougit si
  l'un d'eux y revient.
- [x] AC2 — Avec `API_INTERNAL_URL`, chaque relais joint l'API par elle, avec les en-têtes du
  chemin interne.
- [x] AC3 — Chaque relais propre à un visiteur relaie `accept-language` et `X-Forwarded-For`.
- [x] AC4 — Les tests existants des relais restent verts.

## Hypothèse

- **`maintenance/status` est un appel partagé** : il est mis en cache 60 s par `fetch`
  (`next.revalidate`), et Next met les en-têtes dans la clé de ce cache (lu,
  `node_modules/next/dist/server/lib/incremental-cache/index.js:283-296`). L'IP et la langue du
  visiteur y feraient une entrée par visiteur. Il passe donc par `urlApiServeur()` et
  `enTetesServeurAmont({ partage: true })` — les en-têtes du chemin interne, identiques pour tous,
  sans `X-Forwarded-For` — comme le fait `apiFetch` pour un appel `partage` (TCK-598). La réponse
  de l'API (`MaintenanceStatusController`) ne porte aucun texte traduit (lu).
- Le « 22 » de la décision compte un fichier de test (`data-exports/[id]/download/__tests__`) :
  les relais sont 21, six faits par TCK-893 et quinze ici.

## Hors périmètre

- Poser `API_INTERNAL_URL` sur un environnement : le porteur.
- Le reste de la réponse des relais (en-têtes rendus, corps) : inchangé, sauf par TCK-893.

## Notes d'implémentation

_(à remplir par implementing-specs)_
