---
id: TCK-608
title: "Une échéance dit ce qui a été versé et ce qui reste à rembourser : la part versée s'enregistre et se solde, `refund_pending` voit tous les doublons et retombe une fois remboursé (suites de TCK-595 passe 3 et TCK-596 m-p)"
status: todo
phase: P2
family: full
estimate: M
wave: 74
created: 2026-10-08
updated: 2026-10-08
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
2. **Une `partially_paid` ne se solde pas.** `LeasePaymentService::markPaid`
   (`app/Services/Model/LeasePaymentService.php:60-64`) n'accepte que `pending` et `late` → 422
   `lease_payment.cannot_mark_paid` (règle de 93b4c90c, 2026-04-17). Une échéance créée
   `partially_paid` reste due pour toujours.
3. **Une part non numérique fait tomber les tableaux de bord.** `CollectedPayments::OWED_REMAINING_SQL`
   (`app/Services/Dashboard/CollectedPayments.php:47`) caste `(metadata->>'paid_amount')::numeric` :
   une valeur `""`, `"abc"`, `true` ou un objet, écrite hors du modèle, rend **500 (22P02)** sur le
   tableau de bord de l'agence, la balance âgée et la tuile locataire (verif-595 passe 3, harnais `q8`).
   Le modèle la refuse (`HasPaymentAttributes.php:116-122`) ; une écriture brute non. Une valeur
   négative brute ne donne pas non plus le résultat de l'accesseur.
4. **« 1 impayé à 0 F ».** Une `partially_paid` entièrement versée compte encore comme un impayé de
   0 F sur tous les lecteurs, relances comprises (`q9` : 2 / 0).
5. **m-p — `refund_pending` ne voit que la transaction vérifiée.** `PaymentGatewayController::isRefundPending`
   (`app/Http/Controllers/Api/PaymentGatewayController.php:98-107`) exige que le doublon soit inscrit
   sous **la transaction que `verify` interroge**, et une réponse du fournisseur (`:65`). Trois chemins
   réels rendent `false` sur une échéance annulée dont le locataire **a été débité** : N2 (deux
   checkouts, le plus ancien payé), N3 (intégration désactivée après le webhook, statut `null`), N4
   (Lemon Squeezy : doublon inscrit sous l'id de commande, `verify` interroge le checkout — le drapeau
   n'y est **jamais** vrai). La page affiche alors « Paiement échoué — réessayez », et `initiate` y
   rend 409.
6. **Le drapeau ne retombe jamais.** `gateway_duplicate_payment` n'a pas de marque « remboursé » :
   une fois l'agence passée au remboursement, `verify` annonce encore « remboursement à venir ».
7. **Part pénalité.** Un règlement qui solde le loyer après que la pénalité a été réglée à l'agence
   inscrit la part pénalité en doublon (`kind: late_fee`), exclue du drapeau : la page dit « Paiement
   confirmé » sans annoncer le remboursement partiel.

## Décision du porteur

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

- [ ] Endpoint `POST /api/lease-payments/{payment}/installments` (`RecordLeaseInstallmentRequest`,
      `LeasePaymentService::recordInstallment`) — même autorisation que `mark-paid`.
- [ ] `LeasePaymentService::markPaid` : `partially_paid` accepté, soldé au reste dû.
- [ ] `CollectedPayments::OWED_REMAINING_SQL` (et tout lecteur SQL de `paid_amount` :
      `grep -rn "paid_amount')::numeric" app`) : contrainte 3 ; filtre `reste > 0` (contrainte 4).
- [ ] `PaymentGatewayController::isRefundPending` : contrainte 5 ; champ `late_fee_refund_pending`.
- [ ] `POST /api/lease-payments/{payment}/duplicate-refunded` : marque les doublons `refunded_at`,
      journal `activity('LeasePayment')` ; même autorisation que le remboursement d'une réservation
      (famille « argent qui sort », 2FA d'agence).
- [ ] Front : geste « Enregistrer un versement » et reste dû sur l'échéance ; page de retour de
      paiement : `cancelled` + `refund_pending` → « l'agence vous remboursera », `cancelled` sans
      drapeau → « échéance annulée ; si vous avez été débité, l'agence vous remboursera », jamais
      « réessayez » ; part pénalité annoncée.
- [ ] Tests : `LeaseInstallmentTest`, `OwedRemainderTest` (cas non numériques et reste 0),
      `RefundPendingTest` (N2, N3, N4, extinction), tests front de la page de retour.

## Critères d'acceptation

- [ ] **AC1.** Échéance de 100 000 : versement de 40 000 → `partially_paid`, `paid_amount` 40 000,
      *Impayé* de l'agence compte 60 000 ; versement de 60 000 → `paid`. Un versement de 70 000 sur
      le reste de 60 000 → 422.
- [ ] **AC2 (rouge sur `839be671`).** `mark-paid` sur une `partially_paid` → 200 `paid` (aujourd'hui
      422 `lease_payment.cannot_mark_paid`).
- [ ] **AC3 (rouge sur `839be671`).** Écriture brute de `paid_amount` = `"abc"`, `""`, `true`, `{}` puis
      `-5` : `GET /api/dashboard/agency`, la balance âgée et `GET /api/dashboard/tenant` rendent 200,
      et le reste dû de la ligne vaut celui de l'accesseur.
- [ ] **AC4.** Une `partially_paid` entièrement versée n'apparaît dans aucun compte d'impayés ni de
      relances.
- [ ] **AC5 (m-p, rouge sur `839be671`).** Rejeu de N2, N3 et N4 (verif-596 passe 9) :
      `refund_pending: true` dans les trois cas.
- [ ] **AC6.** Après « Doublon remboursé » : `refund_pending: false` ; l'action est au journal ; un
      doublon inscrit ensuite rallume le drapeau.
- [ ] **AC7 (front).** Page de retour : `cancelled` sans drapeau ne propose jamais de réessayer ;
      avec drapeau, le texte du remboursement s'affiche ; la part pénalité s'annonce.
- [ ] Chaque AC a son ablation rouge, consignée (dont : verrou relu hors de la transaction
      d'écriture pour AC1).

## Hors périmètre

- Le remboursement lui-même par le fournisseur (manuel, hors plateforme).
- La caution et l'échéancier d'un bail renouvelé ou résilié (TCK-607).
- Le paiement partiel par le lien porteur (TCK-602, Hors périmètre).

## Notes d'implémentation

_(à remplir par implementing-specs)_
