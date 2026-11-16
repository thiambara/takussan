---
id: TCK-2924
title: "Crédits : les lots épuisés ou expirés, et le rapport des mises en avant sur 30 jours"
status: done
phase: P2
family: back
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: []
blocks: [TCK-2925]
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#95-creditlot-"
    - "docs/models-spec.md#94-propertyboostdailystat-"
tags: [back, credits, boost, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

L'agence retrouve ses lots de crédits épuisés ou expirés et lit, sur 30 jours, ce que ses mises en avant ont rapporté.

## Contrat de données

Relevé du 2026-11-15 : `GET /api/credits` (`Credits/CreditController.php:27`) ne rend que les lots `spendable()` ; aucune route ne rend les lots épuisés ou expirés. Les mesures journalières des mises en avant existent (`property_boost_daily_stats`) mais aucune route ne les rend en série sur 30 jours. Écarts acceptés de TCK-2664 (« Rapport des 30 derniers jours », « Lots épuisés ou expirés »), sans ticket.

- `GET /api/credits/lots?filter[state]=spent|expired` : les lots non dépensables de l'espace actif, paginés, triés du plus récent.
- `GET /api/credits/boosts/report?days=30` : par jour, impressions, clics (et vues de fiche si TCK-2923 est fusionné : sinon le champ est absent) ; par mise en avant, les totaux de la période.

## Contraintes strictes (métier)

- Même espace et même autorisation que `GET /api/credits` (ADR-0061).
- `days` borné (7, 30, 90) ; toute autre valeur → 422.
- Sparse fieldsets et pagination selon `docs/spatie-query-builder.md`.

## Delta à produire

- [ ] Route `GET /api/credits/lots` (`Credits/CreditLotController@index`), scopes `spent()` et `expired()` sur `CreditLot`.
- [ ] Route et contrôleur du rapport (`CreditBoostReportController`).
- [ ] Tests : `CreditLotsHistoryTest`, `CreditBoostReportTest`.

## Critères d'acceptation

- [ ] AC1 — Un lot à solde 0 et un lot expiré de l'espace A paraissent dans `filter[state]=spent` et `filter[state]=expired` respectivement ; un lot encore dépensable n'y paraît pas ; un lot de l'espace B jamais.
- [ ] AC2 — `GET /api/credits/boosts/report?days=30` rend 30 jours consécutifs (jours sans mesure à 0) et des totaux par mise en avant égaux à la somme des jours ; `days=12` → 422.
- [ ] AC3 — Un appelant sans accès au portefeuille de l'espace reçoit la même réponse que sur `GET /api/credits` (403 / 422 `credits.no_space`).

## Hors périmètre

- L'écran (TCK-2925). La série des vues de fiche (TCK-2923).

## Notes d'implémentation

2026-11-15 — implémenté (agent délégué, worktree `feat/audit-manques-2026-11-15`), après TCK-2923 : le rapport porte
donc les vues de fiche.

- **Prémisse qui différait** : l'expiration (`CreditLedger::expireDue`) solde le lot à 0 avec un mouvement `expire`.
  « Solde 0 » ne veut donc pas dire « épuisé ». **Décision** — deux états exclusifs, dont l'union est exactement le
  complément de `spendable()` : `expired()` = un mouvement `expire`, OU un reste > 0 avec une date passée (pas encore
  balayé) ; `spent()` = solde 0 sans mouvement `expire` (un lot vidé avant sa date reste épuisé quand la date passe).
  Scopes `spent()`, `expired()`, `notSpendable()` sur `CreditLot`.
- **`GET /api/credits/lots`** (`CreditLotController@index`, `IndexCreditLotsRequest`) : `HasQueryBuilder`
  (`$queryFields` + filtre `state` sur `CreditLot`), `fields[credit_lots]`, `per_page` 1 à 50, plus récent d'abord ;
  chaque ligne porte `state` (`CreditLot::stateSql()`). `filter[state]` inconnu → 422. `CreditLotResource` passe à
  `whenHas` : `GET /api/credits` lit toutes les colonnes et garde sa forme (`CreditsApiTest` vert).
- **`GET /api/credits/boosts/report?days=7|30|90`** (défaut 30, `CreditBoostReportController`) : `data.days[]`
  (`date`, `impressions`, `clicks`, `views`), consécutifs, jours UTC, 0 sans mesure ; `data.boosts[]` (les mises en
  avant qui ont couru dans la période, leurs totaux) ; `meta {days, from, to}`. **Décision (vues)** : `views` d'un jour =
  les vues d'un bien un jour où l'une de ses mises en avant courait, comptées une fois par bien et par jour ; la somme
  des `views` par mise en avant peut donc dépasser celle des jours si deux mises en avant du même bien se chevauchent
  (impressions et clics : égalité exacte, AC2).
- Même garde que `GET /api/credits` : `AuthorizesWalletReading` (403 avant 422) + `ReadsWallet` (422 `credits.no_space`).
- Tests : `CreditLotsHistoryTest` (4), `CreditBoostReportTest` (4, dont deux mises en avant du même bien le même
  jour : 9 vues au jour, pas 18) — verts ; 13 ablations une à une, toutes rouges, restaurées au md5 (une 14e, sur le
  `whenHas` d'une colonne LUE, restait verte : elle ne testait rien et a été refaite sur une colonne omise).
- Autres lecteurs de `CreditLotResource` vérifiés : `GET /api/credits` (`CreditsApiTest`) et la console
  (`AdminCreditWalletController`, `AdminCreditsApiTest`, `AdminCreditsStepUpTest`) lisent toutes les colonnes : même forme.
- Garde `DateInventoryByValueTest` : `CreditLotResource::state` inscrite dans `CLES_JAMAIS_ATTEINTES` (chaîne, jamais
  une date). Les mêmes gardes que TCK-2923 sont vertes.
- Docs : `docs/spatie-query-builder.md`.

