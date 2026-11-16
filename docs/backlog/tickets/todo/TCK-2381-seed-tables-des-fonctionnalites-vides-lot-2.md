---
id: TCK-2381
title: "Le seed remplit les tables restantes : relevés bancaires, reprises, relevés bailleur, métriques plateforme, annonces, alertes"
status: todo
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-25
updated: 2026-11-16
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
    - "docs/models-spec.md#50-tenantonboardingchecklist-"
tags: [api, seed, données, rapprochement, reporting]
---

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : partiellement fermé.** Aucun commit ne cite ce ticket ; dépendance TCK-2379 : done.

- **Fermé entre-temps** : `lease_guarantor` est semée par `database/seeders/Activity/LeaseSeeder.php:352-364`
  (à la signature du premier bail, TCK-2377, commit `067cd4f6e`), plus `Crm/GuarantorSeeder.php`
  branché dans `YearOfActivitySeeder.php:94`. Retirée de la liste ci-dessous.
- Les dix autres tables n'ont toujours aucun seeder ; aucune n'est dans `PAR_AGENCE`
  (`SeedingFeatureTablesTest.php:54-88`). Les services à emprunter existent
  (`ReconciliationManager`, `OwnerStatementSnapshots`, `PlatformMetricsSnapshotter`).
- Base locale (informatif, pas un seed frais) : `platform_metrics_daily`=1, `threshold_alerts`=2,
  `notification_delivery_attempts`=11 — origine non établie, à compter juste après le prochain
  `migrate:fresh --seed`.

**Reste à faire** : les seeders par domaine, rejoués par `Timeline::aLaDate()` et branchés dans
`YearOfActivitySeeder::PIPELINE` (l.68) ; les invariants ; `PAR_AGENCE` ; AC4. Candidate naturelle
au même lot : `reconciliation_ignored_payments` (créée le 2026-11-15, `IgnoredPaymentService`).

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
~~`lease_guarantor`~~ (semée par `LeaseSeeder.php:352-364` depuis TCK-2377 — caduc, relevé
2026-11-16), `tenant_onboarding_checklists`, `data_exports`,
`notification_delivery_attempts`. À ajouter éventuellement au rapprochement :
`reconciliation_ignored_payments` (créée le 2026-11-15).

## Contraintes strictes (métier)

Celles de TCK-2379, reconduites :

- passer par le service métier quand il existe (import d'un relevé et rapprochement, génération
  du relevé bailleur, calcul des métriques quotidiennes), rejoué à sa date par
  `Timeline::aLaDate()` ;
- les montants dérivent des paiements et reversements semés, jamais d'un tirage indépendant ;
- aucun appel réseau pendant le seed (`Http::preventStrayRequests()` dans le test).

## Delta à produire

- [x] Seeders rangés dans le dossier de leur domaine, branchés dans
      `YearOfActivitySeeder::PIPELINE` après leurs dépendances.
- [x] Les invariants qui en découlent dans `ReferentialIntegrityChecker`
      (`database/seeders/Support/ReferentialIntegrityChecker.php` ; ligne de relevé
      rapprochée ↔ paiement du même montant, reprise ≤ reversement, métrique du jour = compte
      des lignes du jour).
- [x] Les tables ajoutées à `SeedingFeatureTablesTest::PAR_AGENCE` quand elles se rattachent à une
      agence.

## Critères d'acceptation

- [x] AC1 — Après un seed, chaque table ci-dessus rattachée à une agence a au moins une ligne par
      agence `standard` ; les tables de plateforme (`platform_metrics_daily`, `announcements`) en
      ont au moins une.
- [x] AC2 — Chaque ligne de relevé rapprochée désigne un paiement de même montant, d'une date
      voisine.
- [x] AC3 — `platform_metrics_daily` d'un jour se recalcule depuis les lignes semées de ce jour.
- [x] AC4 — Le seed ne fait aucune requête HTTP sortante.

## Hors périmètre

- Les intégrations de paiement semées sans les clés que leurs pilotes exigent (constat de
  TCK-2379) : le porteur décide s'il en veut de complètes, parce qu'en préproduction des clés
  factices complètes feraient appeler les prestataires.

## Notes d'implémentation

_(à remplir par implementing-specs)_

## Livré (2026-11-16)

- Neuf seeders en un bloc juste avant `PostProcessingSeeder` (insérés plus haut, ils décaleraient le tirage
  de tous les suivants) : `Activity/{TenantOnboarding,PayoutClawback,OwnerStatementSnapshot}Seeder`,
  `Accounting/BankStatementSeeder`, `Engagement/{ThresholdAlert,NotificationDelivery}Seeder`,
  `System/{Announcement,PlatformMetrics}Seeder`, `Core/DataExportSeeder` ; chacun passe par le service
  (`ReconciliationManager`, `IgnoredPaymentService`, `PayoutClawbacks` + `ObservedRefundPayout`,
  `OwnerStatementSnapshots::record`, `PlatformMetricsSnapshotter::snapshot`, `TenantOnboardingService`,
  `DataExportBuilder` + `PurgeExpiredDataExports`, `SmsRouterDriver`) rejoué par `Timeline::aLaDate()`.
- Le relevé est un vrai CSV déposé comme `BankStatementController::store`, lu par `ParseBankStatementJob` puis
  apparié par le matcher, tous deux joués en ligne (`handle()`) : la file `sync` diffère ses jobs à la validation
  de la transaction englobante, et la revue qui suit trouvait un relevé encore `processing`. Lignes = encaissements reçus sur le compte (`expectedBankAmount()`, référence du paiement)
  + reversements émis (net) + frais bancaires ignorés ; espèces et Free Money sortis du reste à rapprocher
  (`reconciliation_ignored_payments`). Deux mois clôturés, le dernier en revue avec un tiers des propositions.
- `PayoutSeeder` pose désormais la copie de ligne au pivot (TCK-2017) : sans elle `recordRefund()` n'écrit
  aucune reprise. La commission d'un reversement semé est la somme de celles des lignes. Le remboursement suit le
  dernier reversement du bailleur : la reprise reste due, aucun reversement semé ne l'impute.
- Les relevés de gérance sont figés AVANT le remboursement (l'instantané du 1er ne peut pas déduire un
  remboursement postérieur : il se lit en rectificatif). Un seeder ne lève que si sa source existait et qu'il
  n'a rien écrit (agence sans reversement, relevé déjà déposé : rien à dériver, pas une faute).
- Aucun envoi sortant : avis d'import/clôture de relevé faux le temps du seeder (affirmé : aucune notification
  `bank_statement.*`), `payouts:send-owner-statements`
  non joué (il avise et son cache le rendrait muet), avis « export prêt » non envoyé, chaînes SMS réduites au
  pilote `log` (tentatives au fournisseur `log`). Le CSV du relevé va au disque privé des médias (`r2-private` en
  préproduction) comme les dossiers KYC et les contrats figés du lot 1 : ce n'est pas une dépendance neuve.
- Métriques : 90 jours de flux, stocks sur la veille seule (comme `metrics:snapshot`). `data_exports` et
  `announcements` n'ont pas d'agence : comptées « au moins une » avec `platform_metrics_daily`.
- Preuves : AC1-AC4 — `SeedingFeatureTablesTest` (8 tables ajoutées à `PAR_AGENCE`, 3 tables plateforme, non-vacuité
  des lignes rapprochées des deux sens et des reprises, 3 invariants à zéro, `Http::preventStrayRequests()`) ;
  invariants qui mordent — `RemainingTablesInvariantsTest` (ablation : les trois rendus à 0 → 3 rouges) ;
  ablation des copies au pivot → `PayoutClawbackSeeder : aucune reprise pour l'agence standard 1`.

