---
id: TCK-844
title: "`/api/enums/{key}` : la lecture publique ne rend plus `usage_count`"
status: done
phase: P2
family: back
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#apienumskey-rend-à-tout-anonyme-le-compte-de-tous-les-biens-par-valeur-brouillons-et-biens-privés-compris-et-na-aucun-appelant-hors-de-la-console"
tags: [back, enums, confidentialite, pistes]
---

## Contexte

Réf : **P28.02** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

`GET /api/enums/{key}` est anonyme (ni `auth`, ni limiteur) et servie `public, max-age=300`. Elle
passait par `BusinessEnumService::get()`, qui ajoute à chaque valeur un `usage_count` compté sur
toute la table `properties`, sans filtre de visibilité ni d'agence : brouillons et biens privés
compris.

## Décision du porteur

retirer `usage_count` de la lecture publique ; la route reste

## Objectif utilisateur

Un visiteur anonyme lit les valeurs actives d'un enum métier et leurs libellés, sans apprendre
combien de biens, publiés ou non, portent chaque valeur.

## Contrat de données

- `GET /api/enums/{key}` (existante) : même forme, sans la clé `usage_count` dans `data.values[]`.
- `GET /api/admin/enums/{key}` (super-admin, existante) : inchangée, `usage_count` compris.

## Delta à produire

- [x] `BusinessEnumService::get()` : paramètre `withUsage` (vrai par défaut) ; faux, ni le
  comptage groupé ni la clé `usage_count`.
- [x] `PublicBusinessEnumController::show()` passe `withUsage: false`.
- [x] Test : `BusinessEnumTest::test_public_read_does_not_expose_usage_count_and_admin_keeps_it`.

## Critères d'acceptation

- [x] AC1 — Un `villa` publié et deux en brouillon : `GET /api/enums/property_type` anonyme rend
  200, et aucune valeur ne porte `usage_count`.
- [x] AC2 — Même jeu : `GET /api/admin/enums/property_type` en super-admin rend `usage_count: 3`
  pour `villa`.

## Hors périmètre

- La route reste (décision du porteur) ; ni `auth` ni limiteur ajoutés.
- Qui doit lire ces valeurs (angle 66 du fichier de pistes).

## Notes d'implémentation

- Ablation : `withUsage: false` retiré du contrôleur public → le test neuf rougit
  (`usage_count` présent) ; remis → `BusinessEnumTest` 7 verts.
- Le comptage n'est plus joué du tout sur la lecture publique : une requête groupée en moins.
