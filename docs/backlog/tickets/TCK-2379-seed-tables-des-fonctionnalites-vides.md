---
id: TCK-2379
title: "Le seed remplit les tables des fonctionnalités livrées : commissions, abonnements et crédits, signatures, KYC, prospects, statistiques de boost"
status: todo
phase: P2
family: technique
estimate: L
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: [TCK-2377]
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#85-commissionentry-"
    - "docs/models-spec.md#44-agencysubscription-"
    - "docs/models-spec.md#95-creditlot-"
    - "docs/models-spec.md#82-leasesignature-"
    - "docs/models-spec.md#84-leasepaymentlink-"
    - "docs/models-spec.md#42-kycdossier-"
    - "docs/models-spec.md#76-payoutmethod-"
    - "docs/models-spec.md#48-invitation-"
    - "docs/models-spec.md#67-propertycontactlead-"
    - "docs/models-spec.md#94-propertyboostdailystat-"
    - "docs/models-spec.md#100-propertyboosttranche-"
tags: [api, seed, données, commissions, crédits, kyc, boosts]
---

## Objectif utilisateur

Chaque écran livré — commissions d'un agent, crédits et abonnement d'une agence, signature d'un
bail, vérification KYC, prospects entrants, performance d'une vedette — s'ouvre sur une base semée
avec des données, et non sur un état vide jamais vu en démo ni en préproduction.

## Contexte

Audit du seeding du 2026-10-25 (base `takussan_seed_audit`, configuration par défaut). Tables
**vides** après le seed, alors que du code les lit (contrôleurs et services) :

`commission_entries`, `agency_subscriptions`, `credit_lots`, `credit_movements`,
`lease_signatures`, `lease_payment_links`, `lease_guarantor`, `payout_methods`, `kyc_dossiers`,
`invitations`, `property_contact_leads`, `property_contacts`, `property_unavailabilities`,
`property_reports`, `bank_statements`, `payout_clawbacks`, `owner_statement_snapshots`,
`platform_metrics_daily`, `property_boost_daily_stats`, `property_boost_tranches`,
`tenant_onboarding_checklists`, `announcements`, `threshold_alerts`, `data_exports`,
`notification_delivery_attempts`.

162 vedettes (`property_boosts`) existent sans aucune tranche ni statistique.

## Contraintes strictes (métier)

- Chaque ligne semée est celle qu'écrirait l'application pour le même événement : **passer par
  le service métier** quand il existe (registre de commissions, grand livre des crédits,
  génération d'un relevé), plutôt que d'écrire une forme que l'application ne produit pas
  (leçon de TCK-1875 sur les conversations).
- Les montants dérivent des paiements semés (commission = paiement × taux du bail ou du
  collaborateur), jamais d'un tirage indépendant.
- Les crédits respectent l'invariant du grand livre (solde = Σ mouvements) ; un abonnement suit
  son `Plan`.
- Pas d'appel réseau (prestataires KYC, paiement, SMS) pendant le seed.

## Delta à produire

- [ ] Seeders nouveaux, rangés dans le dossier de leur domaine, branchés dans
      `YearOfActivitySeeder::PIPELINE` après leurs dépendances : commissions, abonnements,
      crédits et mouvements, signatures et liens de paiement de bail, moyens de reversement et
      leur vérification, dossiers KYC, invitations (acceptées, en attente, expirées), prospects
      entrants et contacts de bien, indisponibilités, signalements, tranches et statistiques
      quotidiennes de boost.
- [ ] Lot 2 (peut se découper en ticket fils si le lot 1 suffit à l'estimation) : relevés
      bancaires et rapprochement, reprises de reversement, instantanés de relevé bailleur,
      métriques plateforme quotidiennes, annonces, alertes de seuil.
- [ ] Assertions ajoutées à `SeedingInvariantsTest` : chaque table du lot 1 non vide, et ses
      invariants (solde des crédits, commission = f(paiement)).

## Critères d'acceptation

- [ ] AC1 — Après un seed par défaut, chaque table du lot 1 a au moins une ligne par agence
      `standard`.
- [ ] AC2 — Pour toute agence, le solde de crédits rendu par le service de l'application est égal
      à Σ `credit_movements`.
- [ ] AC3 — Chaque `commission_entries` se rattache à un paiement `paid` et son montant se recalcule
      depuis ce paiement et le taux applicable.
- [ ] AC4 — Chaque bail `active` ou `expired` a ses `lease_signatures` ; aucun `draft` n'en a de
      complète.
- [ ] AC5 — Chaque `property_boosts` passé ou en cours a des statistiques quotidiennes sur sa
      période et ses tranches.
- [ ] AC6 — Le seed ne fait aucune requête HTTP sortante (`Http::preventStrayRequests()` pendant le
      test).

## Hors périmètre

- Les tables du framework (`jobs`, `sessions`, `cache`, `personal_access_tokens`…) et
  `lemon_squeezy_*`.
- Les demandes RGPD (`privacy_requests`, `account_deletion_requests`) et l'usurpation
  (`impersonation_sessions`) : à semer seulement si le porteur le demande.

## Notes d'implémentation

_(à remplir par implementing-specs)_
