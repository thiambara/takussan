---
id: TCK-619
title: "Gardes de test qu'une mutation traverse encore : l'amorce `staff` d'un admin d'agence, le verrou et l'écriture de `mark-paid` dans la même transaction, le verrou d'`initiate` (suites de TCK-593, TCK-595 et TCK-596)"
status: todo
phase: P2
family: technique
estimate: S
wave: 76
created: 2026-10-08
updated: 2026-11-16
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

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : toujours vrai** sur les trois points vivants (le point 2 reste sans objet). Relevé par
lecture du code et des tests, sans ablation.

- Point 1 : `PropertyIndexQueryBudgetTest` n'a toujours aucun propriétaire admin d'agence ; le test de
  parité ajouté par TCK-2739 (`MembershipCapabilityResolverPrimedParityTest`) juge `allows()`, pas
  `isStaffAt` — il ne garde pas cette clé de l'amorce.
- Point 3 : `LeaseRenewalOverlapTest` ne relève toujours que le `FOR UPDATE`, pas l'`UPDATE` au même niveau.
- Point 4 **a changé de forme** : TCK-1075 (`ae8cc99ec`) a refondu `initiate` en trois temps
  (`initiateWith` : réservation sous verrou, appel fournisseur hors transaction, enregistrement sous un
  second verrou). `PaymentInitiationOutsideTransactionTest` est séquentiel et ne relève aucun
  `FOR UPDATE`. Delta 4 et AC4 réécrits ci-dessous ; `initiateLocked` n'existe plus.
- Reste : les trois gardes, chacune démontrée par ablation. Pas de décision du porteur attendue.

## Objectif utilisateur

Le porteur peut se fier au vert de la suite sur quatre comportements que les contre-vérifications ont
corrigés : aujourd'hui, une régression de chacun la laisserait verte.

## Contexte

Mutations **survivantes** relevées par les dernières passes adverses (verif-593, verif-595 passe 3,
verif-596 passe 9) et consignées dans `FILE-D-ATTENTE.md`. Le code est juste ; c'est la garde qui
manque. *Un test vert ne prouve rien s'il serait vert sans le correctif.*

**Re-mesure sur `839be671` (2026-10-08)** :

1. **Amorce `staff` (595).** `MembershipCapabilityResolver::primed()` remplit `staff` des profils
   agent, **admin d'agence** et délégations (`takussan-api/app/Services/Membership/MembershipCapabilityResolver.php:611-614`),
   lu par `isStaffAt()` (`:539`). `PropertyIndexQueryBudgetTest::test_la_page_amorcee_rend_ce_que_la_ligne_rendrait`
   (`tests/Feature/Property/PropertyIndexQueryBudgetTest.php:155`) n'a aucun propriétaire de bien
   admin d'agence : retirer les `AgencyAdminProfile` de `staff` laisse le test vert.
2. **`/api/dashboard/stats` (595 passe 3).** `DashboardController::stats` a trois branches : globale
   (`:52`, `globalStats()` `:78`), locataire (`:71`, `tenantStats()` `:129`) et agence.
   `OwedRemainderTest` (`tests/Feature/Reporting/OwedRemainderTest.php:106-135`) n'appelle `/stats`
   que comme admin d'agence et comme bailleur ; le locataire n'y passe que par `/dashboard/tenant`, le
   super-admin jamais. Les deux autres branches peuvent recompter les impayés sans la règle
   `CollectedPayments::leaseOwed()` sans qu'un test rougisse.
   **Sans objet depuis le 2026-10-18 : `GET /api/dashboard/stats` est retiré (TCK-952, piste
   P45.03), faute d'appelant.** Le point, sa ligne de Delta et l'AC2 tombent avec la route.
3. **`mark-paid` : verrou et écriture (596, P9-ML.4).** `LeasePaymentService::markPaid`
   (`app/Services/Model/LeasePaymentService.php:53-55`) relit l'échéance `FOR UPDATE` dans une
   transaction et y écrit. `LeaseRenewalOverlapTest::test_mark_paid_rereads_the_due_under_lock`
   (`tests/Feature/Api/LeaseRenewalOverlapTest.php:356-375`) affirme que le verrou est pris **dans une**
   transaction du code, pas que l'`UPDATE` passe **dans la même** : un verrou pris puis relâché avant
   l'écriture (deux `DB::transaction` successives) le laisse vert.
4. **Verrou d'`initiate` (593, V2).** ~~`PaymentGatewayService::initiate`
   (`app/Services/Payments/PaymentGatewayService.php:150-158`) relit le paiement `FOR UPDATE` avant
   d'ouvrir un checkout.~~ *Relevé 2026-11-16* : `initiateWith` (`:192-224`, TCK-1075) relit le
   paiement `FOR UPDATE` deux fois, dans deux transactions : à la réservation (`:194`) et à
   l'enregistrement (`:214`), l'appel au fournisseur entre les deux, hors transaction ; les deux passent
   par `lockAndRefresh` (`:226-230`). Aucun test ne relève ce verrou : `PaymentCheckoutReuseTest`,
   `PaymentGatewayVerifyTest` et `PaymentInitiationOutsideTransactionTest` n'en parlent pas (`grep -i "for update"` : rien) ; les deux tests qui en
   relèvent un (`LeasePaymentLinkTest:113-123`, `RentReceiptAfterOnlinePaymentTest:155`) portent sur
   l'émission du lien et sur `verify`.

## Contraintes strictes

1. **Aucun changement de code applicatif.** Seuls des tests (et au besoin un utilitaire de test)
   changent.
2. Chaque garde est **démontrée par ablation** : la mutation décrite est appliquée, le test rougit,
   la mutation est retirée ; la mutation et le message rouge sont consignés dans les Notes.
3. Les gardes de verrou relèvent le SQL réel par `DB::listen` et le niveau de transaction
   (`DB::transactionLevel()`) relatif au test, comme `LeaseRenewalOverlapTest:356-375` — jamais un
   espion qui remplace le service.

## Delta à produire

- [ ] `PropertyIndexQueryBudgetTest` : un bien dont le propriétaire est **admin d'agence** (sans profil
      agent) dans la page amorcée ; `is_agent` et la décision de personnel identiques à la ligne seule.
- ~~`OwedRemainderTest` : `/api/dashboard/stats` en super-admin (branche globale) et en locataire
      (branche locataire), sur la même échéance trop payée.~~ — sans objet, route retirée (TCK-952).
- [ ] `LeaseRenewalOverlapTest` (ou `LeasePaymentMarkPaidLockTest`) : le `FOR UPDATE` et l'`UPDATE
      "lease_payments"` relevés dans **la même** transaction — même niveau, sans `COMMIT` ni
      `RELEASE SAVEPOINT` entre les deux.
- [ ] `PaymentInitiationOutsideTransactionTest` (hôte naturel depuis TCK-1075, même harnais de niveaux
      de transaction ; ~~`PaymentCheckoutReuseTest`~~) : `POST …/initiate` relit le paiement
      `FOR UPDATE` dans chacune des deux transactions d'`initiateWith` : avant l'écriture de la
      réservation, puis avant celle du `transaction_id`.

## Critères d'acceptation

- [ ] **AC1.** Mutation « `staff` sans les `AgencyAdminProfile` » (`MembershipCapabilityResolver.php:612`)
      → le test de la page amorcée rougit.
- ~~**AC2.** Mutation « `globalStats()` compte `overdue_payments` par `status = overdue` » → rouge ;
      même mutation dans `tenantStats()` → rouge.~~ — sans objet, route retirée (TCK-952).
- [ ] **AC3.** Mutation « verrou dans une première `DB::transaction`, écriture dans une seconde »
      dans `markPaid` → rouge. Le code actuel → vert.
- [ ] **AC4.** Mutation « `lockForUpdate()` retiré de `lockAndRefresh` » → rouge ; mutation
      « `lockAndRefresh` sorti de la première `DB::transaction` d'`initiateWith` » → rouge ; même
      mutation sur la seconde → rouge. `lockAndRefresh` sert les deux temps : l'ablation vise chaque
      temps séparément. (réécrit le 2026-11-16 : `initiateLocked` n'existe plus depuis TCK-1075)
- [ ] Les classes touchées restent vertes sur le code actuel ; aucune autre classe ne change.

## Hors périmètre

- Les comportements eux-mêmes (TCK-593, TCK-595, TCK-596, faits).
- **504 O7** (ligne supprimée pendant `update()` d'un collaborateur → 404) : **déjà gardé** par
  `PrimaryAgentConcurrentChangeTest::test_la_ligne_liee_par_la_route_puis_supprimee_rend_le_refus_contractuel`
  (`tests/Feature/Property/PrimaryAgentConcurrentChangeTest.php:148`).
- Une campagne de mutation outillée (Infection) : ticket à part si le porteur la veut.

## Notes d'implémentation

_(à remplir par implementing-specs)_
