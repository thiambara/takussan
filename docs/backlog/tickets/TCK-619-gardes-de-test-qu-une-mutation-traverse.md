---
id: TCK-619
title: "Gardes de test qu'une mutation traverse encore : l'amorce `staff` d'un admin d'agence, les branches globale et locataire de `/dashboard/stats`, le verrou et l'écriture de `mark-paid` dans la même transaction, le verrou d'`initiate` (suites de TCK-593, TCK-595 et TCK-596)"
status: todo
phase: P2
family: technique
estimate: S
wave: 74
created: 2026-10-08
updated: 2026-10-08
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#22-rôles--permissions
  models:
    - docs/models-spec.md#15-leasepayment-
tags: [technique, tests, mutation, ablation, verrou, concurrence, tableau-de-bord, amorce]
---

# TCK-619 — Des gardes qu'une mutation ne traverse plus

## Objectif utilisateur

Le porteur peut se fier au vert de la suite sur quatre comportements que les contre-vérifications ont
corrigés : aujourd'hui, une régression de chacun la laisserait verte.

## Contexte

Mutations **survivantes** relevées par les dernières passes adverses (verif-593, verif-595 passe 3,
verif-596 passe 9) et consignées dans `FILE-D-ATTENTE.md`. Le code est juste ; c'est la garde qui
manque. *Un test vert ne prouve rien s'il serait vert sans le correctif.*

**Re-mesure sur `839be671` (2026-10-08)** :

1. **Amorce `staff` (595).** `MembershipCapabilityResolver::primed()` remplit `staff` des profils
   agent, **admin d'agence** et délégations (`takussan-api/app/Services/Membership/MembershipCapabilityResolver.php:521-531`),
   lu par `isStaffAt()` (`:470`). `PropertyIndexQueryBudgetTest::test_la_page_amorcee_rend_ce_que_la_ligne_rendrait`
   (`tests/Feature/Property/PropertyIndexQueryBudgetTest.php:149`) n'a aucun propriétaire de bien
   admin d'agence : retirer les `AgencyAdminProfile` de `staff` laisse le test vert.
2. **`/api/dashboard/stats` (595 passe 3).** `DashboardController::stats` a trois branches : globale
   (`:52`, `globalStats()` `:78`), locataire (`:71`, `tenantStats()` `:129`) et agence.
   `OwedRemainderTest` (`tests/Feature/Reporting/OwedRemainderTest.php:106-135`) n'appelle `/stats`
   que comme admin d'agence et comme bailleur ; le locataire n'y passe que par `/dashboard/tenant`, le
   super-admin jamais. Les deux autres branches peuvent recompter les impayés sans la règle
   `CollectedPayments::leaseOwed()` sans qu'un test rougisse.
3. **`mark-paid` : verrou et écriture (596, P9-ML.4).** `LeasePaymentService::markPaid`
   (`app/Services/Lease/LeasePaymentService.php:46-48`) relit l'échéance `FOR UPDATE` dans une
   transaction et y écrit. `LeaseRenewalOverlapTest::test_mark_paid_rereads_the_due_under_lock`
   (`tests/Feature/Api/LeaseRenewalOverlapTest.php:353-372`) affirme que le verrou est pris **dans une**
   transaction du code, pas que l'`UPDATE` passe **dans la même** : un verrou pris puis relâché avant
   l'écriture (deux `DB::transaction` successives) le laisse vert.
4. **Verrou d'`initiate` (593, V2).** `PaymentGatewayService::initiate`
   (`app/Services/Payments/PaymentGatewayService.php:150-158`) relit le paiement `FOR UPDATE` avant
   d'ouvrir un checkout. Aucun test ne relève ce verrou : `PaymentCheckoutReuseTest` et
   `PaymentGatewayVerifyTest` n'en parlent pas (`grep -i "for update"` : rien) ; les deux tests qui en
   relèvent un (`LeasePaymentLinkTest:113-123`, `RentReceiptAfterOnlinePaymentTest:155`) portent sur
   l'émission du lien et sur `verify`.

## Contraintes strictes

1. **Aucun changement de code applicatif.** Seuls des tests (et au besoin un utilitaire de test)
   changent.
2. Chaque garde est **démontrée par ablation** : la mutation décrite est appliquée, le test rougit,
   la mutation est retirée ; la mutation et le message rouge sont consignés dans les Notes.
3. Les gardes de verrou relèvent le SQL réel par `DB::listen` et le niveau de transaction
   (`DB::transactionLevel()`) relatif au test, comme `LeaseRenewalOverlapTest:353-372` — jamais un
   espion qui remplace le service.

## Delta à produire

- [ ] `PropertyIndexQueryBudgetTest` : un bien dont le propriétaire est **admin d'agence** (sans profil
      agent) dans la page amorcée ; `is_agent` et la décision de personnel identiques à la ligne seule.
- [ ] `OwedRemainderTest` : `/api/dashboard/stats` en super-admin (branche globale) et en locataire
      (branche locataire), sur la même échéance trop payée.
- [ ] `LeaseRenewalOverlapTest` (ou `LeasePaymentMarkPaidLockTest`) : le `FOR UPDATE` et l'`UPDATE
      "lease_payments"` relevés dans **la même** transaction — même niveau, sans `COMMIT` ni
      `RELEASE SAVEPOINT` entre les deux.
- [ ] `PaymentCheckoutReuseTest` : `POST …/initiate` relit le paiement `FOR UPDATE` dans une
      transaction du code, avant l'écriture du `transaction_id`, dans la même transaction.

## Critères d'acceptation

- [ ] **AC1.** Mutation « `staff` sans les `AgencyAdminProfile` » (`MembershipCapabilityResolver.php:523`)
      → le test de la page amorcée rougit.
- [ ] **AC2.** Mutation « `globalStats()` compte `overdue_payments` par `status = overdue` » → rouge ;
      même mutation dans `tenantStats()` → rouge.
- [ ] **AC3.** Mutation « verrou dans une première `DB::transaction`, écriture dans une seconde »
      dans `markPaid` → rouge. Le code actuel → vert.
- [ ] **AC4.** Mutation « `lockForUpdate()` retiré d'`initiate` » → rouge ; mutation « verrou hors de
      la transaction de `initiateLocked` » → rouge.
- [ ] Les classes touchées restent vertes sur le code actuel ; aucune autre classe ne change.

## Hors périmètre

- Les comportements eux-mêmes (TCK-593, TCK-595, TCK-596, faits).
- **504 O7** (ligne supprimée pendant `update()` d'un collaborateur → 404) : **déjà gardé** par
  `PrimaryAgentConcurrentChangeTest::test_la_ligne_liee_par_la_route_puis_supprimee_rend_le_refus_contractuel`
  (`tests/Feature/Property/PrimaryAgentConcurrentChangeTest.php:148`).
- Une campagne de mutation outillée (Infection) : ticket à part si le porteur la veut.

## Notes d'implémentation

_(à remplir par implementing-specs)_
