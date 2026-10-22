---
id: TCK-1173
title: "Occupation des mois passés : un bien archivé, vendu ou passé en vente garde les mois qu'un bail couvrait"
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

Réf : **P93.01** du fichier de pistes, `validé` (V7 accordé).

`PortfolioMetrics` jugeait les biens « éligibles » d'un mois passé sur le `status` et le
`contract_type` d'aujourd'hui : un bien archivé, vendu ou passé en vente sortait de toute la série
d'occupation, mois passés compris (bail `expired` de janvier à juin : 100 % sur six mois, puis 0 %
après l'archivage). L'en-tête de la classe et TCK-595 posent pourtant qu'un chiffre passé ne se
reconstruit pas depuis un statut courant.

## Décision du porteur

validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

**Choix de l'implémenteur.** La piste recommande de « garder dans le dénominateur d'un mois tout
bien couvert par un bail ce mois-là, et n'exclure par statut que les mois postérieurs au passage en
`archived` ou `sold`, si une date l'atteste ». Aucune date de passage n'existe en base ; en ajouter
une serait un V4. Retenu, comme le recommande la ligne `Mesure` du délégué :

- pour un mois **passé** (avant le mois en cours), un bien feuille de la périodicité compte au
  dénominateur et au numérateur s'il est éligible aujourd'hui **ou** si un bail (hors `draft`,
  `pending_signature`) le couvrait au moins un jour ce mois-là, quels que soient son statut et son
  `contract_type` d'aujourd'hui ;
- le **mois en cours** (et l'occupation « aujourd'hui ») garde l'exclusion par statut courant ;
- la courte durée suit la même règle, les réservations `confirmed | completed` tenant lieu de bail.

Hypothèse notée : la périodicité (`rent_period`) d'aujourd'hui reste le critère qui range un bien en
longue ou courte durée (un passage en vente ne la remet pas à `null`, lu : `Property::booted`).

## Objectif utilisateur

La série d'occupation du bailleur et de l'agence ne change pas pour les mois passés quand un bien
est archivé, vendu ou passé en vente.

## Delta à produire

- [x] `PortfolioMetrics::eligibleSql` : rend les biens feuilles de la périodicité avec un drapeau
      `is_current` (éligibles aujourd'hui).
- [x] `longStayOccupancy`, `shortStayOccupancy` : un bien non courant ne compte qu'aux mois passés
      qu'un bail (ou une réservation) couvre ; `longStayOccupancyToday` ne lit que les courants.
- [x] Tests dans `tests/Feature/Dashboard/DashboardOwnerMetricsTest.php`.

## Critères d'acceptation

- [x] AC1 — Bien mensuel, bail `expired` du 2026-01-01 au 2026-06-30, au 2026-07-15 : la série sur
      sept mois vaut 100 de janvier à juin et 0 en juillet, avant l'archivage, après l'archivage, et
      après retour à `available` avec `contract_type = sale`.
- [x] AC2 — Bien journalier réservé (`completed`) du 1ᵉʳ au 16 juin : juin vaut 50 avant et après
      l'archivage.
- [x] AC3 — Les tests existants des tableaux de bord (bailleur, agence, agent, budget de requêtes)
      restent verts.

## Hors périmètre

- Une date de passage en `archived` / `sold` (V4) : un bien resté vacant tout un mois passé puis
  archivé sort encore du dénominateur de ce mois.

## Notes d'implémentation

- Ablation : `PortfolioMetrics.php` rendu à `HEAD` → les deux tests rouges (série à 0 après
  l'archivage ; juin `null`) ; remis → 10/10 sur `DashboardOwnerMetricsTest`.
- Le dénominateur lit `covered_days` / `nights` (CTE déplacée avant `denom`) : toujours une seule
  requête par série.
