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

- [x] Adaptateur factice de paiement derrière la couture des drivers
- [x] Les tests qui appelaient du privé passent par l'interface publique (ou se déplacent au module qui porte la règle)
- [x] Les trois tests de réglages deviennent un seul, par `ScopedSetting::value`

## Critères d'acceptation

- [x] AC1 — `grep -rln "ReflectionMethod\|setAccessible\|partialMock(PaymentGatewayService" tests` ne rend plus que les gardes de course nommées dans les notes.
- [x] AC2 — Pour chaque règle d'argent déplacée, une ablation de la règle rougit le test réécrit.

## Hors périmètre

- Le front (`takussan-web`) ; renommer les 1 391 méthodes `ac1_/m4_…` (aucun gain de détection ni de temps).

## Notes d'implémentation

Re-mesuré le 2026-11-28 sur l'arbre partagé de `feat/approfondissements-architecture`.

**La couture.** `PaymentGatewayService::driverFor()` fait `new (self::DRIVERS[$provider])($integration)` : aucun
conteneur. La couture qui existe est le client HTTP (`Http::` dans `WaveDriver`), d'où `tests/Support/FakeWave.php`
(décision de la session, option a) : `Http::fake` de `api.wave.com/v1/checkout/sessions*`, le VRAI `WaveDriver`
est éprouvé, sans code de production. Il enregistre `checkouts` (montant tel que Wave le reçoit, donc ÷100 du
montant que le service transmet : les attendus `amount_cents` ont été convertis, aucun affaibli), `appels`,
`verifications`, et offre `pendantLeCheckout`, `pendantLaVerification`, `reglerALaVerification`,
`echouerLeProchainCheckout`. `LeaseDueFixture::spyDriver()` (partialMock de `driverFor`) devient `fakeWave()` ;
ses 20 appelants sont repris. ⚠ `Http::fake` rend la première réponse non nulle : `PaymentGatewayInitiateTest`
posait un Wave par défaut dans `setUp()` qui masquait le faux (les sessions y valaient `cs_wave_123`) ; il s'efface
désormais dès que `fakeWave()` est appelé.

**Réglages.** `ScopedSettingReadersTest`, `RentalSettingsCatalogueTest` et `AgencySettingRowCatalogueTest` →
`tests/Feature/Admin/Platform/ScopedSettingTest.php` (50 tests, autant qu'avant), sans `protegee()` : le plafond des
pénalités se lit par `LateFeeCalculator::compute`, la signature au renouvellement par `LeaseRenewalService::renew`,
les termes figés par `LeaseSignatureService::freezeRenewal`.

**Réflexion et doublures partielles retirées** : devise (`availableProviders`), `amountDue` (public depuis TCK-593),
`ApiErrorCode` (partialMock de `resolveIntegration` inutile : le montant est jugé d'abord), `MaintenanceResolutionReport`
(`getFillable` → l'attribut absent après écriture), `DocumentVault` (`for`/`generatedFor` hors amorce, par une amorce
qui ne couvre aucun couple réel), `MergedReminderPayLink` (données réelles : charges en EUR),
`InvoiceNumbering` m4 (vraie intégration + `verify`), `LeaseRenewalOverlap`, `LeaseDuplicateRefund`,
`PaymentInitiationOutsideTransaction`, `PaymentCheckoutReuse`.

**Retraits sans remplaçant, prouvés par ablation** (la règle mutée ne rougit QUE le test réflexif : elle n'est pas
observable par l'interface) :
- `LienDePaiementPenaliteSeuleTest` : assertions sur `isSettledBy` ; la garde `isLateFeeAloneTransaction` qu'elle
  contient est inatteignable, le court-circuit de `applyStatusToPayment` (~:742) la précède (ablation de ce
  court-circuit : 3 rouges) ;
- `BoostTransitionClaimTest::test_une_reclamation_perdue_laisse_l_instance_conforme_a_la_ligne` (`pause` par
  réflexion) : l'ablation de `$boost->refresh()` dans `claimTransition` ne rougit que lui ;
- `InvoiceNumberingTest::test_ac12_…` (réflexion) : absorbé par m4.

**AC2 — ablations, chacune rouge puis restaurée, md5 vérifié** : plafond agence ignoré (5), clamp retiré (2),
signature exigée ignorée (3), termes figés (1), devise des réglages d'abord (1), abort `amount_unresolved` (1),
fillable `resolution_report` (1), court-circuit pénalité seule (3), « tous ou aucun » du rappel fusionné (1),
`owner_any`→`owner` du coffre (1), appel au fournisseur dans une transaction (1), `releaseReservation` retiré (1),
`settled_by` du réemploi (1), numérotation au règlement (1), `verify` sur la ligne non relue sous verrou (1).

**AC1 — le reste du grep (14 fichiers) n'est pas une couture** : recensements et gardes d'architecture
(`ValeursEnListeParcoursDesRoutes`, `IncludeNomDeMethodeRefuse`, `ModelRelationsExecute`,
`RelationSansCollisionDeColonne`, `QueryNeverFeedsAWrite`, `ReglesDElementBornees`, `FormRequestEtendBaseFormRequest`,
`BasePolicyCapability`, `MembershipCapabilityResolverCache`), harnais (`CompiledViewIsolation`, `TestDatabaseIsolation`),
contrat de fournisseur (`SocleAgentTimeout`, `getTimeout` protégé du SDK), structure de l'image (`EvalSetsShipInTheImage`),
et `NoteDEquipeNonFuite`, « doute » au relevé, non retiré. Les gardes de course qui épinglent un `FOR UPDATE`
(`InvoiceNumbering`, ordre des verrous) ne passent pas par la réflexion.

**Reste à la session** : `app/Domain/Settings/EditablePlatformSettings.php:180` et `docs/adr/0065-…:83` citent les
classes de réglages supprimées ; la garde morte de `isSettledBy` et `$boost->refresh()` de `claimTransition` sont
du code inobservable (à retirer ou à garder, hors de ce ticket) ; `PaymentSupervisionTest` est aussi modifié par un
autre ticket (retrait de `test_agency_staff_is_forbidden_on_the_console_routes`).

