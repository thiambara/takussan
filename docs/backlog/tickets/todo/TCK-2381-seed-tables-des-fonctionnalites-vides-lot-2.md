---
id: TCK-2381
title: "Le seed remplit les tables restantes : relevés bancaires, reprises, relevés bailleur, métriques plateforme, annonces, alertes"
status: todo
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: [TCK-2379]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#40-bankstatement-"
    - "docs/models-spec.md#41-bankstatementline-"
    - "docs/models-spec.md#101-ownerstatementsnapshot-"
    - "docs/models-spec.md#86-platformmetricdaily-"
    - "docs/models-spec.md#46-announcement-"
    - "docs/models-spec.md#65-thresholdalert-"
    - "docs/models-spec.md#27-guarantor-"
    - "docs/models-spec.md#50-tenantonboardingchecklist-"
tags: [api, seed, données, rapprochement, reporting]
---

## Objectif utilisateur

Les écrans que TCK-2379 n'a pas couverts — rapprochement bancaire, reprises de reversement, relevé
du bailleur, tableau de bord de la plateforme, annonces, alertes de seuil — s'ouvrent eux aussi sur
une base semée avec des données.

## Contexte

Lot 2 de TCK-2379, découpé à l'implémentation : le lot 1 (quinze tables, commissions à
statistiques de boost) suffisait à l'estimation L. Tables encore vides après un seed par défaut,
lues par du code :

`bank_statements` (et leurs lignes), `payout_clawbacks`, `owner_statement_snapshots`,
`platform_metrics_daily`, `announcements`, `threshold_alerts` — et, restées hors du lot 1 :
`lease_guarantor`, `tenant_onboarding_checklists`, `data_exports`,
`notification_delivery_attempts`.

## Contraintes strictes (métier)

Celles de TCK-2379, reconduites :

- passer par le service métier quand il existe (import d'un relevé et rapprochement, génération
  du relevé bailleur, calcul des métriques quotidiennes), rejoué à sa date par
  `Timeline::aLaDate()` ;
- les montants dérivent des paiements et reversements semés, jamais d'un tirage indépendant ;
- aucun appel réseau pendant le seed (`Http::preventStrayRequests()` dans le test).

## Delta à produire

- [ ] Seeders rangés dans le dossier de leur domaine, branchés dans
      `YearOfActivitySeeder::PIPELINE` après leurs dépendances.
- [ ] Les invariants qui en découlent dans `ReferentialIntegrityChecker` (ligne de relevé
      rapprochée ↔ paiement du même montant, reprise ≤ reversement, métrique du jour = compte
      des lignes du jour).
- [ ] Les tables ajoutées à `SeedingFeatureTablesTest::PAR_AGENCE` quand elles se rattachent à une
      agence.

## Critères d'acceptation

- [ ] AC1 — Après un seed, chaque table ci-dessus rattachée à une agence a au moins une ligne par
      agence `standard` ; les tables de plateforme (`platform_metrics_daily`, `announcements`) en
      ont au moins une.
- [ ] AC2 — Chaque ligne de relevé rapprochée désigne un paiement de même montant, d'une date
      voisine.
- [ ] AC3 — `platform_metrics_daily` d'un jour se recalcule depuis les lignes semées de ce jour.
- [ ] AC4 — Le seed ne fait aucune requête HTTP sortante.

## Hors périmètre

- Les intégrations de paiement semées sans les clés que leurs pilotes exigent (constat de
  TCK-2379) : le porteur décide s'il en veut de complètes, parce qu'en préproduction des clés
  factices complètes feraient appeler les prestataires.

## Notes d'implémentation

_(à remplir par implementing-specs)_
