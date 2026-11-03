---
id: TCK-2379
title: "Le seed remplit les tables des fonctionnalités livrées : commissions, abonnements et crédits, signatures, KYC, prospects, statistiques de boost"
status: done
phase: P2
family: technique
estimate: L
wave: null
created: 2026-10-25
updated: 2026-10-26
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

- [x] Seeders nouveaux, rangés dans le dossier de leur domaine, branchés dans
      `YearOfActivitySeeder::PIPELINE` après leurs dépendances : commissions, abonnements,
      crédits et mouvements, signatures et liens de paiement de bail, moyens de reversement et
      leur vérification, dossiers KYC, invitations (acceptées, en attente, expirées), prospects
      entrants et contacts de bien, indisponibilités, signalements, tranches et statistiques
      quotidiennes de boost.
- [x] Lot 2 (peut se découper en ticket fils si le lot 1 suffit à l'estimation) : relevés
      bancaires et rapprochement, reprises de reversement, instantanés de relevé bailleur,
      métriques plateforme quotidiennes, annonces, alertes de seuil. → **découpé en TCK-2381**,
      avec `lease_guarantor`, `tenant_onboarding_checklists`, `data_exports` et
      `notification_delivery_attempts`, restés hors du lot 1.
- [x] Assertions ajoutées à `SeedingInvariantsTest` : chaque table du lot 1 non vide, et ses
      invariants (solde des crédits, commission = f(paiement)). → dans une classe propre,
      `SeedingFeatureTablesTest`, et douze invariants de plus dans `ReferentialIntegrityChecker`,
      que tout seed juge désormais.

## Critères d'acceptation

- [x] AC1 — Après un seed par défaut, chaque table du lot 1 a au moins une ligne par agence
      `standard`.
- [x] AC2 — Pour toute agence, le solde de crédits rendu par le service de l'application est égal
      à Σ `credit_movements`.
- [x] AC3 — ~~Chaque `commission_entries` se rattache à un paiement `paid` et son montant se
      recalcule depuis ce paiement et le taux applicable.~~ **Amendé** : l'application ne calcule
      pas la commission sur un paiement. `CommissionLedgerService::generateFor` la calcule à la
      signature, sur les frais d'agence du bail (`leases.commission_amount`), × la part de chaque
      bénéficiaire. Le critère tenu : chaque ligne vient d'un premier bail signé, sa base est
      `commission_amount`, et son montant vaut `⌊base × part / 100⌋` (forme du service).
- [x] AC4 — Chaque bail `active` ou `expired` a ses `lease_signatures` ; aucun `draft` n'en a de
      complète. **Précisé** : un renouvellement a son contrat figé (`freezeRenewal`), mais pas de
      signatures, comme dans l'application ; un premier bail a les deux (bailleur, locataire) sur
      l'empreinte de son contrat ; un brouillon n'en a aucune.
- [x] AC5 — Chaque `property_boosts` passé ou en cours a des statistiques quotidiennes sur sa
      période et ses tranches. **Précisé** : seules les Vedettes en ont. Une Remontée ou un Badge
      n'a ni tranche ni statistique dans l'application.
- [x] AC6 — Le seed ne fait aucune requête HTTP sortante (`Http::preventStrayRequests()` pendant le
      test).

## Hors périmètre

- Les tables du framework (`jobs`, `sessions`, `cache`, `personal_access_tokens`…) et
  `lemon_squeezy_*`.
- Les demandes RGPD (`privacy_requests`, `account_deletion_requests`) et l'usurpation
  (`impersonation_sessions`) : à semer seulement si le porteur le demande.

## Notes d'implémentation

**Rejouer l'application à une date passée.** `Timeline::aLaDate($date, $geste)` pose
`Carbon::setTestNow()` le temps du geste. Les services de l'application écrivent alors leurs lignes
à cette date : registre des commissions, grand livre, achats et fin de boost, abonnements,
signature, KYC, moyens de reversement, liens de paiement. Les flux qui notifient (KYC, invitations,
demandes, signalements) sont écrits dans la forme du service, avec l'`activity_log` qu'il écrit,
sans rejouer l'envoi.

**Mesuré, sur le jeu réduit du test** (une agence demandée, les quatre agences nommées) : 54
commissions, 6 abonnements, 5 lots et 19 mouvements de crédits, 106 signatures, 20 moyens de
reversement (tous vérifiés), 3 dossiers KYC, 91 invitations, 170 demandes, 45 contacts, 26
indisponibilités, 4 signalements, 15 boosts, 7 tranches, 127 statistiques quotidiennes. Un contrat
figé coûte environ 0,23 s (dompdf).

**Trois constats, à connaître :**

1. **Le pilote PDF du `.env` local est Cloudflare** (`LARAVEL_PDF_DRIVER=cloudflare`). Le premier
   seed de ce chantier a donc appelé l'API de rendu Cloudflare pour chaque contrat, jusqu'au
   `Rate limit exceeded`. Le seed force désormais dompdf pendant son exécution, puis rend le pilote
   d'origine (`YearOfActivitySeeder::prepareEnvironment`). Le test pose le pilote Cloudflare avec
   des identifiants factices, sous `Http::preventStrayRequests()`.
2. **`PhoneVerified` part après le commit** (`ShouldDispatchAfterCommit`), et chaque seeder tourne
   dans sa transaction : le crédit de bienvenue tombait à la fin du seeder, à l'heure réelle, après
   tous les achats. Mesuré : trois agences sur quatre n'achetaient rien, solde nul à chaque geste.
   `BoostActivitySeeder` rejoint `YearOfActivitySeeder::HORS_TRANSACTION`. Les autres événements
   `ShouldDispatchAfterCommit` qu'un seeder déclencherait subissent le même décalage. Aucun autre
   seeder de ce lot n'en dépend pour une ligne qu'il écrit.
3. **Les intégrations Wave et Orange Money qu'`IntegrationSeeder` pose n'ont pas les clés que leurs
   pilotes exigent** (`CREDENTIAL_KEYS`) : aucune agence semée n'encaisse en ligne. Les liens de
   paiement viennent donc tous de l'agent, et non de la relance « bientôt dû ». Ce point n'est pas
   corrigé ici. En préproduction, des clés factices complètes feraient appeler les prestataires :
   c'est au porteur de trancher (noté hors périmètre de TCK-2381).

**Seed par défaut complet**, mesuré le 2026-10-25 sur `takussan_seed_audit`, avec le `.env` local
(médias et jeux de cas limites allumés) : 1 108 s, invariants tenus. Comptes : 179 commissions, 6
abonnements, 5 lots et 59 mouvements de crédits, 318 signatures, 40 liens de paiement, 27 moyens de
reversement, 3 dossiers KYC, 160 invitations, 210 demandes, 156 contacts, 150 indisponibilités, 5
signalements, 122 boosts, 31 tranches, 474 statistiques quotidiennes.

Rejoué après coup, le vérificateur a relevé deux écarts. Aucun n'est un défaut du jeu réaliste :

- 68 Vedettes offertes sans tranche, toutes sur des biens `is_test` : `OfferedFeaturedSeeder`
  (`LegacyFeaturedConversion`) convertit, après le vérificateur, les biens `featured` des jeux de
  cas limites. Le jeu réaliste n'en pose plus aucun (`PropertySeeder` : `featured => false`).
- 4 Vedettes en cours dont la dernière statistique date de l'avant-veille : le seed avait passé
  minuit. L'invariant tolère désormais l'absence de la veille, mais exige toujours une série sans
  trou depuis le premier jour ; trois ablations le confirment.

**Ablations** (2026-10-25, une à la fois, `SeedingFeatureTablesTest` rejoué) :

| Retiré | Résultat |
|---|---|
| le forçage de dompdf pendant le seed | rouge — `StrayRequestException` vers Cloudflare |
| les signatures sur papier (bail dont le locataire n'a pas de compte) | rouge — AC4, bail figé sans signature |
| `BoostActivitySeeder` hors transaction | rouge — AC1, ni tranche ni statistique pour les agences 2 et 3 |
| le filtre des renouvellements de `CommissionSeeder` | **vert** : doublé par `CommissionLedgerService::generateFor`, qui refuse un renouvellement, et par `LeaseSeeder`, qui ne lui donne pas de frais d'agence |

**Ce que le lot coûte au seed** (jeu réduit du test, chronométré par seeder) :
`LeaseSignatureSeeder` 24 s, `BoostActivitySeeder` 4 s. Ce dernier rejouait d'abord un passage
de `boosts:tick` par heure sur six mois, soit 4 380 passages et 20,5 s. Il ne rejoue plus que les
passages qui ont une échéance à solder, au créneau de cinq minutes qui la suit, comme le
planificateur (`everyFiveMinutes`).

**`SEED_SIGNED_CONTRACTS=false`** saute le rendu des contrats (≈ 0,23 s par bail). Les tests de
seed qui ne lisent pas les signatures l'éteignent (`SeedingGrowthTest`, `SeedingJourneyTest`,
`SeedingTextAndDeterminismTest`).
