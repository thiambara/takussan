---
id: TCK-893
title: "Relais BFF : une seule fonction relayerVersApi() pour les six relais"
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-41--chemins-nominaux-du-bff--cookie--bearer-en-têtes-relayés"
tags: [front, bff, console, pistes]
---

## Contexte

Réf : **P41.03** du fichier de pistes (« Petites améliorations » de l'angle 41), `validé`.

Six relais BFF (`super-admin`, `agencies`, `admin-users`, `super-admin-properties`,
`announcements`, `impersonation/proxy`) réécrivent chacun le même `forward()`, et chacun diverge :
trois relisent le corps par `request.text()`, qui remplace tout octet hors UTF-8 par U+FFFD (le
défaut que TCK-601 a corrigé dans `super-admin`) ; quatre ne relaient que `content-type` en
réponse ; cinq n'envoient ni `accept-language` ni les en-têtes du chemin serveur.

## Décision du porteur

validé — une fonction `relayerVersApi()` dans `src/lib/` (corps en octets, `null` sur 204/205/304, `content-type`, `content-disposition`, `cache-control`, `accept-language`, en-têtes serveur), appelée par les six relais ; le compte et la liste de `takussan-web/CLAUDE.md` sont corrigés en session le 2026-10-18

## Objectif utilisateur

Un envoi depuis la console ou l'espace applicatif arrive à l'API tel qu'il est parti, dans la
langue de l'utilisateur, quel que soit le relais traversé.

## Delta à produire

- [x] `src/lib/relais-api.ts` : `relayerVersApi(request, cheminAmont, options)` — URL par
  `urlApiServeur()`, en-têtes de `enTetesServeurAmont()`, `content-type` et `accept-language` de la
  requête, corps en octets, corps `null` sur 204/205/304, `content-type`, `content-disposition` et
  `cache-control` de la réponse relayés.
- [x] Les six relais l'appellent ; chacun garde ce qui lui est propre (jeton, profil actif,
  chemin réservé, `Accept` de la requête, effacement de la session sur 401).
- [x] Test : chaque relais, octets `ff 80 00 41` intacts, `accept-language` relayé, chemin serveur
  et `X-Forwarded-For` du visiteur, en-têtes de réponse relayés.

## Critères d'acceptation

- [x] AC1 — Un corps non UTF-8 arrive octet pour octet à l'API, par chacun des six relais.
- [x] AC2 — `accept-language` de la requête est relayé par chacun des six relais.
- [x] AC3 — Avec `API_INTERNAL_URL`, les six relais joignent l'API par elle, avec
  `X-Forwarded-For` du visiteur et les en-têtes du chemin interne.
- [x] AC4 — `content-type`, `content-disposition` et `cache-control` de la réponse sont relayés.
- [x] AC5 — Les tests existants des relais (204, multipart de la console, impersonation) restent verts.

## Hors périmètre

- Les quinze autres relais qui appellent `origineApi()` et la garde statique : P41.02 (TCK-894).
- `takussan-web/CLAUDE.md` : corrigé en session par le porteur le 2026-10-18.
- `feature-flags/me` et `maintenance/status` (type de contenu perdu) : ce ne sont pas des
  `forward()`, ils passent au chemin serveur avec P41.02.

## Notes d'implémentation

_(à remplir par implementing-specs)_
