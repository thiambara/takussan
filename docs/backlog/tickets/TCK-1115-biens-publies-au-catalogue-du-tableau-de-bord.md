---
id: TCK-1115
title: "Tuile « Biens » du tableau de bord d'agence : « publiés » compté par le prédicat du catalogue"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#3-property"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-93--indicateurs-des-tableaux-de-bord-et-du-relevé--valeurs-fausses-sur-des-données-réelles"
tags: [back, dashboard, pistes]
---

## Contexte

Réf : **P93.06** du fichier de pistes, `validé (délégué)` (V7 accordé).

`DashboardAgencyService::summary` comptait `properties.published` sur « `published_at` non nul et
statut hors `draft`, `archived` » : un bien vendu, loué, en revue ou refusé restait « publié »,
alors que le catalogue public (`Property::scopePublic`) l'exclut, et que la plateforme compte déjà
ses annonces publiées par ce prédicat (`HealthcheckService`).

## Décision du porteur (déléguée)

compter `properties.published` par le prédicat du catalogue, `Property::query()->public()` borné à l'agence (même périmètre que `total`), sans changer le libellé « publiés » ; un test épingle un bien `sold` publié qui ne compte plus, et un bien `available` public qui compte

## Objectif utilisateur

L'indice « N publiés » de la tuile « Biens » dit combien de biens de l'agence sont au catalogue
public.

## Delta à produire

- [x] `DashboardAgencyService::summary` : `published` = biens de l'agence dont l'`id` est dans
      `Property::query()->public()`, en sous-requête de l'agrégat existant.
- [x] Test dans `tests/Feature/Dashboard/DashboardAgencyTest.php`.

## Critères d'acceptation

- [x] AC1 — Deux biens de l'agence publiés et publics, l'un `available`, l'autre `sold`, plus un
      bien public d'une autre agence : `properties.total` 2, `properties.published` 1.
- [x] AC2 — Le nombre de requêtes du tableau de bord ne change pas (`DashboardQueryBudgetTest` vert).

## Hors périmètre

- Le libellé « publiés » (inchangé, par décision).
- `PlatformMetricsSnapshotter` (`properties_published` compté sur un statut `published`), relevé
  au passage.

## Notes d'implémentation

- Ablation : `DashboardAgencyService` rendu à `HEAD` → rouge (`published` 2 au lieu de 1) ;
  remis → 9/9 sur la classe.
- Le compte reste dans l'agrégat (`COUNT(*) FILTER (WHERE id IN (<public()>))`) : une requête de
  plus aurait mis en jeu le plafond de `DashboardQueryBudgetTest`, seuil fermé à l'implémenteur.
