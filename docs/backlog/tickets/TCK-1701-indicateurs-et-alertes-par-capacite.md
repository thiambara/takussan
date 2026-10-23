---
id: TCK-1701
title: "Indicateurs et alertes de seuil : créer, modifier et supprimer se jugent par agency.update, plus par le type de profil admin"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#64-kpiconfig-"
    - "docs/models-spec.md#65-thresholdalert-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-82--bailleur-et-membre-jugés-en-dur-hors-de-landlordwrites-et-des-capacités"
tags: [back, dashboard, agency, authorization, capabilities, pistes]
---

## Contexte

Réf : **P82.04** du fichier de pistes (« Indicateurs et alertes de seuil : jugés par le type de
profil admin, jamais par une capacité »), validé par le porteur.

Créer, modifier et supprimer une `KpiConfig` ou une `ThresholdAlert` exigeaient `isAgencyAdminAt`
seul, recopié dans six endroits (`StoreKpiConfigRequest`, `UpdateKpiConfigRequest`,
`StoreThresholdAlertRequest`, `UpdateThresholdAlertRequest`, `KpiConfigController::authorizeAgency`,
`ThresholdAlertController::authorizeAgency`). Aucune capacité du catalogue ne gardait ces écrans :
un admin dont le rôle personnalisé retire toutes les capacités configurait les indicateurs (201),
un agent dont le rôle les porte toutes en était refusé (403).

## Décision du porteur

`agency.update`, jugée sous le profil actif, par une policy sur la forme d'`AgencyPolicy::updateKyc`
(correctif écrit par l'implémenteur le 2026-10-21, puis retiré faute de pouvoir toucher la garde).
Le porteur accorde de retirer `'agency.update' => 'D-69'` de `CapabilityEnforcementInventory` et de
baisser `CLIQUET` de 7 à 6 dans `scripts/check-capability-readers.mjs`. La lecture (`GET`) ne change
pas.

## Objectif utilisateur

Un rôle personnalisé décide de qui configure les indicateurs et les alertes de l'agence : il peut
le retirer à un admin et le donner à un membre.

## Delta à produire

- [x] `app/Policies/AgencyIndicatorPolicy.php` : `create(User, ?Agency)`, `update` et `delete`
      (`KpiConfig|ThresholdAlert`) — super-admin, administrateur principal de l'agence, ou
      `agency.update` à cette agence sous un profil actif de cette agence.
- [x] Liée à `KpiConfig` et `ThresholdAlert` dans `AppServiceProvider::bootGatesAndPolicies()`.
- [x] Les quatre `authorize()` délèguent à la policy ; `store` vise l'agence du profil actif.
- [x] Les deux `authorizeAgency()` deviennent des relais (`can('delete', …)`) : ils restent parce
      qu'ils sont inscrits aux exemptions de `scripts/check-controller-authorization.mjs`.
- [x] `agency.update` quitte l'inventaire ; `CLIQUET` 7 → 6 ; dette D-69 mise à jour dans
      `docs/ardoise.md`.
- [x] Tests dans `tests/Feature/Dashboard/AgencyIndicatorCapabilityTest.php`.

## Critères d'acceptation

- [x] AC1 — admin dont le rôle retire `agency.update` : 403 sur les six gestes (création,
      modification, suppression des deux ressources), rien n'est écrit ; `GET` des deux listes
      reste 200.
- [x] AC2 — agent dont le rôle porte `agency.update` : 201 / 200 / 200 sur les deux ressources.
- [x] AC3 — admin système et super-admin inchangés ; agent système toujours refusé.
- [x] AC4 — l'agent qui tient la capacité ne touche pas les indicateurs d'une autre agence ; l'admin
      de A agissant sous son profil d'agent de B est refusé sur A (contrat TCK-146).
- [x] AC5 — `node scripts/check-capability-readers.mjs` sort en 0 (41 lues, 6 inscrites, cliquet 6).

## Hors périmètre

- Retirer les deux `authorizeAgency()` et leurs exemptions de `check-controller-authorization.mjs`.
- `docs/features.md` § 2.5 marque toujours ces deux lignes 🛡️ sans nommer de capacité : `/sync-specs`.
- ADR-0031 cite encore `agency.update` parmi les capacités sans geste : c'est l'état au moment de
  la décision, que D-69 met à jour.
- Aucun changement du front.

## Notes d'implémentation

- Avant le correctif : AC1 et AC2 rouges (l'admin sans la capacité passait sur les six gestes,
  l'agent qui la tient était refusé sur les six).
- Ablation 1 : les six sites rendus à leur version d'avant (`isAgencyAdminAt`) → 2 rouges (AC1,
  AC2) ; remis → vert.
- Ablation 2 : la clause de profil actif retirée de la policy → 1 rouge (AC4, admin de A sous B).
- Écart assumé avec l'ancien code : comme `updateKyc`, l'administrateur principal de l'agence passe
  sans condition de profil actif ni de capacité (il ne s'enferme pas dehors par l'édition d'un rôle).
