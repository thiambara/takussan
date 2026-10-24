---
id: TCK-1999
title: "Une ligne de réglage d'agence obéit au catalogue au PUT comme au POST, et s'écrit sous la forme canonique"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md#30-setting-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#put-apisettingsid-enregistre-sur-une-ligne-dagence-une-valeur-que-le-catalogue-refuse-au-post"
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#une-ligne-de-réglage-dagence-garde-tout-ce-que-le-client-envoie-autour-de-value-et-chaque-lecture-le-relit"
tags: [api, settings, validation, pistes]
---

## Contexte

Réfs : **P181.01** et **P181.04** du fichier de pistes, `validé` (V1 accordé), même ticket par
décision du porteur.

`StoreSettingRequest::after()` jugeait une ligne d'agence par le catalogue (TCK-964) ;
`UpdateSettingRequest` n'avait que `value: required|array`, et `PUT /api/settings/{id}` écrivait
`["abc", -5, 100000]` sur `invoice.reminder_offsets_days`. Les deux routes écrivaient le tableau
`value` entier, clés inconnues comprises.

## Décision du porteur

P181.01 :

> validé — validation du porteur (2026-10-23) : la piste telle qu'écrite : une seule règle partagée par le `POST` et le `PUT`, la clé lue sur la ligne ; même ticket que P181.04

P181.04 :

> validé — validation du porteur (2026-10-23) : réécrire la ligne sous la forme canonique `{"value": …}`, au `POST` comme au `PUT` ; même ticket que P181.01

## Objectif utilisateur

Un réglage d'agence n'enregistre que ce que le catalogue admet, quelle que soit la route, et rien
d'autre que sa valeur.

## Delta à produire

- [x] `App\Http\Requests\Concerns\JugeLaLigneDeReglageDAgence` : la règle (clé `rentals` du
  catalogue, valeur déballée jugée par `rules`/`item_rules`) et `formeCanonique()`.
- [x] `StoreSettingRequest::after()` l'emploie ; `UpdateSettingRequest::after()` aussi, la clé lue
  sur la ligne, pour une ligne d'agence.
- [x] `SettingController::store` et `::update` écrivent `{"value": <valeur déballée>}`.
- [x] `tests/Feature/Admin/Platform/ReglageDAgenceAuPutTest.php`.

## Critères d'acceptation

- [x] AC1 — au `PUT`, chaque valeur hors bornes du catalogue → 422 sur `value`, ligne inchangée.
- [x] AC2 — au `PUT`, une ligne dont la clé est hors catalogue → 422 sur `key`.
- [x] AC3 — `PUT` et `POST` admis écrivent `{"value": …}` seul, sans les clés reçues autour.
- [x] AC4 — la forme héritée `{"months": 3}` s'écrit `{"value": 3}`.

## Hors périmètre

- Les lignes déjà écrites avec des clés de trop ne sont pas réécrites (aucune migration) : elles le
  seront au prochain `POST` ou `PUT`.

## Notes d'implémentation

- Ablation (changements de `app/` retirés) : 9 rouges ; remis → 9/9.
