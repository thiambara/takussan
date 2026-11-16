---
id: TCK-608
title: "Une échéance dit ce qui a été versé et ce qui reste à rembourser : la part versée s'enregistre et se solde, `refund_pending` voit tous les doublons et retombe une fois remboursé (suites de TCK-595 passe 3 et TCK-596 m-p)"
status: todo
phase: P2
family: full
estimate: M
wave: 76
created: 2026-10-08
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
    - docs/features.md#14-location-longue-durée-baux
    - docs/features.md#25-reporting--tableaux-de-bord
  models:
    - docs/models-spec.md#15-leasepayment-
tags: [back, front, paiement, echeance, paiement-partiel, doublon, remboursement, tableau-de-bord]
---

# TCK-608 — La part versée et le doublon à rembourser

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : partiellement fermé.** Aucun commit ne cite TCK-608.

- **Fermé** : point 3 (cast SQL) par TCK-2721 (`8bc7c4db4`, `2011ea9af`) — `OWED_REMAINING_SQL`
  lit `paid_amount` par un fragment tolérant, borné à ≥ 0 (`PaidAmountTolerantReadTest`) → AC3 tenu.
- **Changé de nature** : point 1 — plus **aucune** voie ne crée de `partially_paid` (bail : pas de
  `status` ; réservation : retiré par TCK-1918, `87544a65a`, décision du porteur). Elle ne vit plus que
  sur des lignes héritées ; le point 4 (« 1 impayé à 0 F ») reste vrai mais inerte.
- **En partie** : point 6 — TCK-871 pose `refunded_at` sur le doublon remboursé **par webhook du
  fournisseur** (`PaymentGatewayService.php:1570-1586`), mais `isRefundPending` ne le lit pas et aucun
  geste manuel n'existe.
- **Reste** : `markPaid` accepte `partially_paid` (lignes héritées) ; `isRefundPending` sur tout doublon
  hors `late_fee` sans `refunded_at` + `late_fee_refund_pending` + geste « Doublon remboursé » ; filtre
  `reste > 0` (FinanceSummary, AgingBalance, PortfolioMetrics, relances) ; page de retour front.
- **Décision attendue du porteur** : versement partiel sur une échéance de **bail** — **(a)** geste
  « Enregistrer un versement », ou **(b)** aligné sur TCK-1918 (aucune part ; `mark-paid` solde les
  `partially_paid` héritées, ticket ramené à S) ?

## Objectif utilisateur

Un agent enregistre qu'un locataire a versé une partie de son loyer, puis solde le reste ; un
locataire débité sur une échéance annulée lit « l'agence vous remboursera », jamais « réessayez »,
et ne le lit plus une fois remboursé.

## Contexte

Suites de **TCK-595** (verif-595 passe 3, observations 1 à 3 ; Notes du ticket, lot 16 « En suite »)
et de **TCK-596** (verif-596 passe 9, m-p, et remarques « le drapeau ne s'éteint jamais », « part
pénalité »), consignées dans `FILE-D-ATTENTE.md` (16:25, 19:35).

TCK-595 a fait compter *Impayé* au **reste dû** (`amount − metadata.paid_amount`) sur tous les
lecteurs. Mais rien n'écrit la part versée : la règle est juste et inerte.

**Re-mesure sur `839be671` (2026-10-08)** :

1. **Aucun chemin n'enregistre une part versée.** `metadata.paid_amount` n'est écrit par aucun code
   (`grep -rln paid_amount app` : lecteurs seuls — `HasPaymentAttributes`, `CollectedPayments`,
   `LateFeeCalculator`, ressources). `PaymentStoreRequest` (`app/Http/Requests/PaymentStoreRequest.php:30`)
   accepte `status: partially_paid` sans part : la ligne naît `paid_amount = 0`, reste dû = montant.
   *(2026-10-18 : `PaymentStoreRequest` est retiré avec `POST /api/payments` par TCK-940 ; la voie
   imbriquée, `StoreLeasePaymentRequest`, ne reçoit pas de `status`. Ce point est à re-mesurer
   avant d'implémenter : il ne reste peut-être aucune voie qui crée une `partially_paid`.)*
   *(2026-11-16 : re-mesuré — **aucune**. Bail : pas de `status` ; réservation :
   `StoreBookingPaymentRequest.php:78-81` limite `status` à `Paid|Pending` depuis TCK-1918, décision
   du porteur « une part reçue est une ligne `paid` de son montant ».)*
2. **Une `partially_paid` ne se solde pas.** `LeasePaymentService::markPaid`
   (`app/Services/Model/LeasePaymentService.php:66-71`) n'accepte que `pending` et `late` → 422
   `lease_payment.cannot_mark_paid` (règle de 93b4c90c, 2026-04-17). Une échéance créée
   `partially_paid` reste due pour toujours.
3. **Une part non numérique fait tomber les tableaux de bord.** `CollectedPayments::OWED_REMAINING_SQL`
   (`app/Services/Dashboard/CollectedPayments.php:66`) caste `(metadata->>'paid_amount')::numeric` :
   une valeur `""`, `"abc"`, `true` ou un objet, écrite hors du modèle, rend **500 (22P02)** sur le
   tableau de bord de l'agence, la balance âgée et la tuile locataire (verif-595 passe 3, harnais `q8`).
   Le modèle la refuse (`HasPaymentAttributes.php:118-124`) ; une écriture brute non. Une valeur
   négative brute ne donne pas non plus le résultat de l'accesseur. — **fermé par TCK-2721**
   (`8bc7c4db4`, `2011ea9af`) : fragment tolérant, borné à ≥ 0, parité épinglée par
   `PaidAmountTolerantReadTest` (écart assumé : tableau JSON non vide, 1 en PHP, 0 en SQL).
4. **« 1 impayé à 0 F ».** Une `partially_paid` entièrement versée compte encore comme un impayé de
   0 F sur tous les lecteurs, relances comprises (`q9` : 2 / 0).
5. **m-p — `refund_pending` ne voit que la transaction vérifiée.** `PaymentGatewayController::isRefundPending`
   (`app/Http/Controllers/Api/PaymentGatewayController.php:170-179`) exige que le doublon soit inscrit
   sous **la transaction que `verify` interroge**, et une réponse du fournisseur (`:67`). Trois chemins
   réels rendent `false` sur une échéance annulée dont le locataire **a été débité** : N2 (deux
   checkouts, le plus ancien payé), N3 (intégration désactivée après le webhook, statut `null`), N4
   (Lemon Squeezy : doublon inscrit sous l'id de commande, `verify` interroge le checkout — le drapeau
   n'y est **jamais** vrai). La page affiche alors « Paiement échoué — réessayez », et `initiate` y
   rend 409.
6. **Le drapeau ne retombe jamais.** `gateway_duplicate_payment` n'a pas de marque « remboursé » :
   une fois l'agence passée au remboursement, `verify` annonce encore « remboursement à venir ».
   *(2026-11-16 : TCK-871 pose déjà `refunded_at` sur l'entrée remboursée par webhook du
   fournisseur, `PaymentGatewayService.php:1570-1586` ; `isRefundPending` ne la lit pas.)*
7. **Part pénalité.** Un règlement qui solde le loyer après que la pénalité a été réglée à l'agence
   inscrit la part pénalité en doublon (`kind: late_fee`), exclue du drapeau : la page dit « Paiement
   confirmé » sans annoncer le remboursement partiel.

## Décision du porteur

> **Tranché le 2026-11-16 : option (b).** Le versement partiel sur une échéance de **bail** s'aligne
> sur TCK-1918 — **aucune part enregistrée** ; `mark-paid` solde les lignes `partially_paid` héritées.
> Le reste du ticket tient : `refund_pending` voit tous les doublons (hors `late_fee`, sans
> `refunded_at`) + `late_fee_refund_pending`, le geste « Doublon remboursé » (manuel, avec son
> autorisation) pose `refunded_at` et éteint le drapeau, les compteurs ne comptent pas un impayé à
> reste nul. Le ticket tombe à S-M : le geste « Enregistrer un versement » (endpoint `installments`,
> AC1, front) sort du périmètre.

> *2026-11-16* : TCK-1918 a tranché (b) **pour les réservations**. La question se pose désormais
> pour les échéances de bail : suivre TCK-1918 (b), ou ouvrir (a) ?

**Le personnel enregistre-t-il un versement partiel ?**

- **(a) Oui** : un geste « Enregistrer un versement » sur une échéance ouverte (montant < reste dû →
  `partially_paid` avec `paid_amount` cumulé ; montant = reste dû → `paid`) ; `mark-paid` solde une
  `partially_paid` au reste dû.
- **(b) Non** : `partially_paid` n'est plus accepté à la création par l'API, la valeur reste réservée
  aux lignes héritées, et `mark-paid` les solde.

*Recommandation de la session : (a)* — un loyer payé en deux fois est courant, et toute la lecture
(reste dû, relances, pénalités sur l'assiette restante) existe déjà. Le Delta est écrit pour (a) ; (b)
en retire le geste front.

**Comment le remboursement d'un doublon se constate-t-il ?** Recommandation : un geste du personnel
« Doublon remboursé » sur l'échéance, journalisé, qui éteint le drapeau ; le remboursement lui-même
reste hors de la plateforme (aucun reversement automatique).

## Contraintes strictes (métier)

1. La part versée vit dans `metadata.paid_amount`, cumulée, écrite sous le verrou de l'échéance
   (relue `lockForUpdate`, même transaction que l'écriture — ce que la garde P9-ML.4 de verif-596 ne
   vérifie pas encore, cf. TCK-619). Un versement qui dépasse le reste dû est refusé (422), sauf le
   surplus que le modèle admet déjà pour le canal en ligne.
2. Un versement manuel pendant qu'un checkout est ouvert suit la règle de `markPaid` (TCK-593, V3).
3. Les lecteurs SQL ne castent qu'une part **numérique** (`jsonb_typeof = 'number'` ou motif
   numérique), bornée à `≥ 0` ; sinon 0. Le résultat SQL est celui de l'accesseur.
4. Une échéance dont le reste dû est 0 n'est **pas** un impayé.
5. `refund_pending` est vrai dès qu'un doublon hors `late_fee` **non remboursé** existe sur
   l'échéance, quelle que soit la transaction vérifiée et même sans réponse du fournisseur. La part
   pénalité en doublon s'annonce à part (« une part vous sera remboursée »).
6. Libellés front : fr/en/wo, par codes (principe n°5).

## Delta à produire

- [ ] ~~Endpoint `POST /api/lease-payments/{payment}/installments` (`RecordLeaseInstallmentRequest`,
      `LeasePaymentService::recordInstallment`) — même autorisation que `mark-paid`.~~ — retiré par
      la décision (b).
- [x] `LeasePaymentService::markPaid` : `partially_paid` accepté, soldé au reste dû.
- [x] `CollectedPayments::OWED_REMAINING_SQL` (et tout lecteur SQL de `paid_amount` :
      `grep -rn "paid_amount')::numeric" app`) : contrainte 3 ; filtre `reste > 0` (contrainte 4).
      — contrainte 3 tenue par TCK-2721 (relevé 2026-11-16) ; reste le filtre `reste > 0` sur
      `FinanceSummaryService`, `AgingBalanceService`, `PortfolioMetrics` (tous via
      `CollectedPayments::leaseOwed()`) et les relances.
- [x] `PaymentGatewayController::isRefundPending` : contrainte 5 ; champ `late_fee_refund_pending`.
- [x] `POST /api/lease-payments/{payment}/duplicate-refunded` : marque les doublons `refunded_at`
      (la clé que TCK-871 pose déjà pour un remboursement du fournisseur — `isRefundPending` la lit),
      journal `activity('LeasePayment')` ; même autorisation que le remboursement d'une réservation
      (famille « argent qui sort », 2FA d'agence).
- [x] Front : ~~geste « Enregistrer un versement » et reste dû sur l'échéance~~ (retiré par (b)) ; page de retour de
      paiement : `cancelled` + `refund_pending` → « l'agence vous remboursera », `cancelled` sans
      drapeau → « échéance annulée ; si vous avez été débité, l'agence vous remboursera », jamais
      « réessayez » ; part pénalité annoncée.
- [x] Tests : ~~`LeaseInstallmentTest`~~ (b), `OwedRemainderTest` (cas non numériques et reste 0),
      `RefundPendingTest` (N2, N3, N4, extinction), tests front de la page de retour.

## Critères d'acceptation

- [ ] **AC1** — *sans objet depuis la décision (b) du 2026-11-16 : aucune part ne s'enregistre.* Échéance de 100 000 : versement de 40 000 → `partially_paid`, `paid_amount` 40 000,
      *Impayé* de l'agence compte 60 000 ; versement de 60 000 → `paid`. Un versement de 70 000 sur
      le reste de 60 000 → 422.
- [x] **AC2 (rouge sur `839be671`).** `mark-paid` sur une `partially_paid` → 200 `paid` (aujourd'hui
      422 `lease_payment.cannot_mark_paid`).
- [x] **AC3 (rouge sur `839be671`).** Écriture brute de `paid_amount` = `"abc"`, `""`, `true`, `{}` puis
      `-5` : `GET /api/dashboard/agency`, la balance âgée et `GET /api/dashboard/tenant` rendent 200,
      et le reste dû de la ligne vaut celui de l'accesseur. (tenu par TCK-2721, relevé 2026-11-16)
- [x] **AC4.** Une `partially_paid` entièrement versée n'apparaît dans aucun compte d'impayés ni de
      relances.
- [x] **AC5 (m-p, rouge sur `839be671`).** Rejeu de N2, N3 et N4 (verif-596 passe 9) :
      `refund_pending: true` dans les trois cas.
- [x] **AC6.** Après « Doublon remboursé » : `refund_pending: false` ; l'action est au journal ; un
      doublon inscrit ensuite rallume le drapeau.
- [x] **AC7 (front).** Page de retour : `cancelled` sans drapeau ne propose jamais de réessayer ;
      avec drapeau, le texte du remboursement s'affiche ; la part pénalité s'annonce.
- [x] Chaque AC a son ablation rouge, consignée (dont : verrou relu hors de la transaction
      d'écriture pour AC1).

## Hors périmètre

- Le remboursement lui-même par le fournisseur (manuel, hors plateforme).
- La caution et l'échéancier d'un bail renouvelé ou résilié (TCK-607).
- Le paiement partiel par le lien porteur (TCK-602, Hors périmètre).

## Notes d'implémentation

## Livré (2026-11-16)

- **(b) appliquée** : `markPaid` accepte `partially_paid` et relève `metadata.paid_amount` au montant
  sous le même verrou (jamais à la baisse : un trop-versé reste dit) — sans quoi l'accesseur d'une ligne
  `paid` lisait encore l'acompte et un reste dû.
  AC2 : `LeaseDuplicateRefundTest::test_mark_paid_solde_…` ; ablations du statut et de la réécriture : rouges.
- **Impayé à reste > 0** posé une fois dans `CollectedPayments::leaseOwed()` (tableaux de bord agence,
  bailleur, locataire, balance âgée, résumé financier, relevé du bailleur) et dans
  `SendLeasePaymentReminders::remindable()`, et dans `OverdueInstalment::daysLate()` (relance notée →
  409) et `PaymentHistory::daysLateSql()` ; ADR-0057 amendé. `LeasePayment::isOverdue()`/`scopeOverdue`
  (paire de parité du trait partagé avec les réservations) n'est pas touchée : une `partially_paid`
  héritée soldée s'affiche encore « en retard », sans être comptée ni relancée. `OwedRemainderTest` passe de 5 à 4
  échéances (l'échéance trop payée n'est plus un impayé). AC4 : `test_une_partially_paid_entierement_versee_…` ;
  ablation de chacun des deux filtres : rouge.
- **`refund_pending` porte sur l'ÉCHÉANCE** (`DuplicatePayments`, lecture unique) : tout doublon hors
  `late_fee` sans `refunded_at`, sans condition de transaction ni de réponse du fournisseur ;
  `late_fee_refund_pending` à part. `PaymentCheckoutReuseTest` réécrit en conséquence (il épinglait
  « le drapeau porte sur le règlement vérifié »). AC5 : tests N2, N3, N4 ; contrôleur d'origine : 4 rouges.
- **« Doublon remboursé »** : `POST /api/lease-payments/{payment}/duplicate-refunded`
  (`LeasePaymentDuplicateRefundController`), qui marque TOUS les doublons non remboursés, part pénalité
  comprise (le webhook de TCK-871 ne note que la transaction remboursée), journal
  `activity('LeasePayment')`/`duplicate_refunded`, 409 sans rien à marquer. Autorisation :
  `LeasePolicy::refundDuplicate` — bailleur direct, personnel détenant **`payments.refund`** (capacité
  jusque-là inerte, retirée de l'inventaire D-69 : cliquet 6 → 5), super-admin. Famille « argent qui
  sort » (`FAMILY_CONTROLLERS` + `AGENCY_TWO_FACTOR`). AC6 et autorisation : ablations du
  `refunded_at`, de l'entrée 2FA et de la capacité : rouges.
- **Front** : `cancelled` sans drapeau devient l'issue `annulee` (« Cette échéance a été annulée… si vous
  avez été débité, l'agence vous remboursera », contact de l'agence, jamais « Réessayer ») ; la part
  pénalité s'annonce sur un paiement confirmé ; « Doublon remboursé » dans le menu de la ligne de
  l'échéancier (`duplicate_refund_pending` de la ressource). AC7 : `PaymentReturnClient.test.tsx`,
  `issue-du-retour.tck-2650.test.ts`, `LeaseSchedule.test.tsx` ; trois ablations : rouges.
