---
id: TCK-3014
title: "Tester le paiement et les réglages par l'interface : un faux adaptateur de paiement, plus de réflexion sur du privé"
status: todo
phase: P2
family: technique
estimate: M
wave: 99
created: 2026-11-28
updated: 2026-11-28
depends_on: [TCK-3012]
blocks: []
spec_refs:
  features: []
  models: []
tags: [technique, tests, back, architecture, adr-0140]
---

## Objectif utilisateur

Une refactorisation sans défaut du paiement, des réglages ou du coffre ne casse plus aucun test.

## Contrat de données

Relevé : 15 fichiers appellent du privé par réflexion (`PaymentGatewayService::{isSettledBy, paymentCurrency, applyStatusToPayment, amountDue}`, `DocumentVault::{build, generatedOf}`, `BoostLifecycle::pause`, `LateFeeCalculator::capPercent`, `LeaseRenewalService::requireSignatureFlag`, méthodes privées du semeur). 6 fichiers et `LeaseDueFixture` doublent partiellement `PaymentGatewayService::driverFor` / `resolveIntegration`. `ScopedSettingReadersTest`, `RentalSettingsCatalogueTest` et `AgencySettingRowCatalogueTest` partagent un fournisseur et recopient `protegee()`. Lignes COUTURE des TSV.

## Contraintes strictes (métier)

- Vérifier d'abord comment les drivers de paiement se résolvent (conteneur ?) ; un adaptateur factice passe par la couture existante (patron `FakeSmsRouter`). Une couture NOUVELLE demande un amendement d'ADR avant le code.
- Les règles d'argent restent éprouvées, seule leur voie d'accès change ; aucun attendu ne s'affaiblit.
- Exception (ADR-0140 § 5) : les gardes de course qui épinglent un `FOR UPDATE` restent.
- **Règle de retrait (ADR-0140 § 3)** : par grappe, relire les deux côtés, puis muter en production la règle que le test retiré garde : un test qui reste doit rougir, sinon le test se déplace au lieu de se supprimer. Une ligne du relevé dont la raison dit « doute » ne se retire pas.
- Les règles sacrées (argent, isolation d'agence et lecture, empreintes et HMAC du Radar, idempotence, autorisation par capacités) ne perdent un test que si un autre rougit à sa place.
- Jamais de suite entière en local : les classes touchées par le créneau ; la CI juge la suite et le cliquet de couverture (`Total:` du job `couverture`).

## Delta à produire

- [ ] Adaptateur factice de paiement derrière la couture des drivers
- [ ] Les tests qui appelaient du privé passent par l'interface publique (ou se déplacent au module qui porte la règle)
- [ ] Les trois tests de réglages deviennent un seul, par `ScopedSetting::value`

## Critères d'acceptation

- [ ] AC1 — `grep -rln "ReflectionMethod\|setAccessible\|partialMock(PaymentGatewayService" tests` ne rend plus que les gardes de course nommées dans les notes.
- [ ] AC2 — Pour chaque règle d'argent déplacée, une ablation de la règle rougit le test réécrit.

## Hors périmètre

- Le front (`takussan-web`) ; renommer les 1 391 méthodes `ac1_/m4_…` (aucun gain de détection ni de temps).
