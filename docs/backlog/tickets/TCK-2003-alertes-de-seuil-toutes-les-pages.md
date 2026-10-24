---
id: TCK-2003
title: "La page « Alertes » de l'aperçu lit toutes les alertes de seuil de l'agence"
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
    - "docs/features.md#25-reporting--tableaux-de-bord"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-171--sélecteurs-et-listes-sans-pagination-nourris-par-la-taille-de-page-par-défaut"
tags: [front, alertes, pagination, pistes]
---

## Contexte

Réf : **P171.02** du fichier de pistes, `validé` (V7 accordé).

`fetchThresholdAlerts` appelait `/api/threshold-alerts` sans paramètre ; `ThresholdAlertController`
rend alors la taille par défaut d'Eloquent, 15. Au-delà de 15, une alerte existe et agit, mais ne
peut être ni vue, ni modifiée, ni supprimée depuis la page « Alertes ».

## Décision du porteur

> validation du porteur (2026-10-23) : la recommandation du délégué, alertes seulement

Recommandation du délégué : `fetchThresholdAlerts` lit toutes les pages par 100
(`lireToutesLesPages`, TCK-1367), la page « Alertes » rend la liste entière, test à 16 alertes ;
« N sur M », texte neuf, au reste.

## Objectif utilisateur

L'administrateur d'agence voit, modifie et supprime chacune de ses alertes de seuil.

## Contrat de données

Aucun changement d'API : `GET /api/threshold-alerts` accepte `page` et `per_page` (100 au plus) et
rend `meta.last_page`.

## Delta à produire

- [x] `fetchThresholdAlerts` lit toutes les pages par 100.
- [x] Test : 16 alertes, l'API bouchonnée à 15 par défaut ; 101 alertes, deux pages lues.

## Critères d'acceptation

- [x] AC1 — la 16ᵉ alerte est rendue à la page.
- [x] AC2 — au-delà de 100, les pages suivantes sont lues.

## Hors périmètre

- La page « Indicateurs » (`fetchKpiConfigs`) : une agence n'y dépasse pas 14 lignes (unicité
  `agency_id, metric`) ; le cas du super-administrateur, que `KpiConfigController` ne borne pas à
  une agence, reste au porteur.
- Un affichage « N sur M ».

## Reste à faire

- La partie « Indicateurs » et l'affichage « N sur M » (voir Hors périmètre).

## Notes d'implémentation

- Ablation : `alerts.ts` rendu à `HEAD` → 2 rouges sur 2 (15 alertes rendues) ; correctif remis →
  2/2 verts.
