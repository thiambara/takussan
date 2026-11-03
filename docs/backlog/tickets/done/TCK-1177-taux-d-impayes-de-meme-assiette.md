---
id: TCK-1177
title: "Taux d'impayés de l'agence : impayé ÷ facturé des échéances échues sur 12 mois, `null` sans échéance"
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
    - "docs/models-spec.md#15-leasepayment-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-93--indicateurs-des-tableaux-de-bord-et-du-relevé--valeurs-fausses-sur-des-données-réelles"
tags: [back, front, dashboard, pistes]
---

## Contexte

Réf : **P93.03** du fichier de pistes, `validé` (V1 et V7 accordés).

`DashboardAgencyService` rapportait l'impayé **cumulé** de tous les baux (clos compris) au loyer
**mensuel** des seuls baux `active` : 350 % pour trois loyers en retard plus un bail clos impayé,
0 % pour une agence dont l'impayé vient d'un bail clos. Le front l'affiche en points (0..100), et une
alerte de seuil `unpaid_rate_percent > N` ne se déclenchait jamais dans le second cas.

## Décision du porteur

validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

**Choix de l'implémenteur.** La définition que la piste recommande : « l'impayé des échéances échues
sur 12 mois ÷ le facturé échu des mêmes échéances », et `null` sans dénominateur. Précisé ainsi :

- échéances : lignes de `lease_payments` hors restitution de caution (l'assiette de
  `CollectedPayments::leaseOwed()`, donc caution comprise), de baux non supprimés, quel que soit le
  statut du bail, dues dans `[aujourd'hui − 12 mois, aujourd'hui[` ;
- numérateur : le reste dû (`OWED_REMAINING_SQL`) des échéances `pending | partially_paid | late` ;
- dénominateur : le montant des mêmes échéances, hors `cancelled` et `failed` (non dues) ;
- `overdue_amount` / `overdue_count` (impayé cumulé) ne changent pas ;
- front : `null` s'affiche en tiret, sans ton d'alerte, comme l'occupation sans bien éligible
  (TCK-1114) ; aucun libellé neuf.

## Objectif utilisateur

Le « Taux d'impayés » du tableau de bord d'agence et des alertes de seuil est un pourcentage borné
à 100, juste quand l'impayé vient d'un bail clos, et absent quand rien n'est échu.

## Delta à produire

- [x] `PortfolioMetrics::unpaidRate()` : une requête, les deux sommes.
- [x] `DashboardAgencyService::summary` : `unpaid_rate_percent` lu de là ; la somme
      `monthly_rent` des baux actifs, devenue sans lecteur, quitte l'agrégat.
- [x] `KpiResolver` : `null` reste `null` (l'alerte de seuil l'écarte déjà, TCK-1114).
- [x] Front : type `number | null`, tuile en tiret sans alerte.
- [x] Tests : `DashboardAgencyTest`, `DashboardOwnerMetricsTest` (AC5 de TCK-595 recalculé),
      `AgencyKpis.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Au 2026-07-15, sans échéance : `unpaid_rate_percent` `null`.
- [x] AC2 — Seul un bail `terminated` avec 50 000 impayés échus : 100 (0 avant).
- [x] AC3 — Plus un bail actif à trois loyers de 100 000 en retard, un payé, un à venir et un échu
      il y a plus de 12 mois : 77,78 (350 000 ÷ 450 000), `overdue_amount` 450 000 inchangé.
- [x] AC4 — La tuile affiche « — » sans ton `warning` quand le taux est `null`.
- [x] AC5 — Le jeu de référence de TCK-595 rend 10 (50 000 ÷ 500 000) ; le budget de requêtes du
      tableau de bord tient.

## Hors périmètre

- Le libellé « Taux d'impayés » et le seuil d'alerte visuelle de 10 %.

## Notes d'implémentation

- Ablation API : `DashboardAgencyService.php` et `KpiResolver.php` rendus à `HEAD` → rouge
  (`0` au lieu de `null`) ; remis → 10/10 sur `DashboardAgencyTest`.
- Ablation front : `AgencyKpis.tsx` rendu à `HEAD` → rouge (« 0 % » au lieu de « — ») ; remis → 6/6.
- `DashboardQueryBudgetTest` vert : la requête ajoutée tient sous le plafond (non modifié).
