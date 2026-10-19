---
id: TCK-965
title: "GET /api/settings réservé à l'admin d'agence, sans les lignes globales"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#get-apisettings-rend-les-réglages-globaux-de-la-plateforme-à-tout-membre-dune-agence"
tags: [back, settings, authorization, pistes]
---

## Contexte

Réf : **P47.05** du fichier de pistes, `validé` (critère accordé : V2).

Hors super-admin, `SettingController::index` rendait les lignes de l'agence de l'appelant **et
toutes les lignes `global`**, sans juger aucune capacité ni le drapeau `public` du catalogue : un
agent ou un bailleur lisait les réglages d'exploitation de la plateforme. Aucun écran n'appelle
cette route.

## Décision du porteur

> `GET /api/settings` réservé, hors super-admin, à l'admin de l'agence, qui n'y lit que les lignes de son agence, jamais les lignes `global` (les réglages publics passent par `publicSettings()`) ; un test : un agent et un bailleur reçoivent 403, un admin d'agence ne lit aucune ligne `global` (porteur, 2026-10-18)

## Objectif

Hors super-admin, seule l'admin de l'agence liste les réglages, et seulement ceux de son agence.

## Hypothèses (mode sans humain)

- « Admin de l'agence » se juge comme l'écriture le fait déjà dans le même contrôleur :
  `isAgencyAdminAt($user->agency_id)`, l'agence étant celle du profil actif.
- Le super-admin garde la lecture de toutes les lignes, comme avant.

## Delta à produire

- [x] `SettingController::index` : 403 hors super-admin et hors admin de l'agence ; filtre sur
  `scope = agency` et `scope_id` = l'agence.
- [x] `tests/Feature/Api/SettingIndexAccessTest.php`.

## Critères d'acceptation

- [x] AC1 — un agent de l'agence reçoit 403.
- [x] AC2 — un bailleur (`owner`) de l'agence reçoit 403.
- [x] AC3 — l'admin de l'agence ne lit que la ligne de son agence : ni ligne `global`, ni ligne
  d'une autre agence.
- [x] AC4 — le super-admin lit toujours toutes les lignes.

## Hors périmètre

- L'écriture par `POST /api/settings` (P47.04, TCK-964).

## Notes d'implémentation

- Avant correctif : 3 rouges (agent et bailleur → 200, admin d'agence → 2 lignes dont la globale).
- Ablation : correctif retiré → les 3 mêmes rouges ; remis → 4 verts. `SettingTest` et
  `tests/Feature/Admin/Platform` restent verts (237 tests).
