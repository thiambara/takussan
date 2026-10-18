---
id: TCK-889
title: "Un remboursement reçu avant le paiement de la même transaction est gardé en attente, puis appliqué"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: [TCK-871, TCK-873]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#6-bookingpayment"
    - "docs/models-spec.md#15-leasepayment-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-39--webhooks-de-paiement-refund-et-failed-sur-un-paiement-déjà-soldé"
tags: [back, payments, webhooks, pistes]
---

## Contexte

Réf : **P39.04** du fichier de pistes, `validé` par le porteur (critère accordé : V1, et le choix
V7 tranché par la précision). Un événement `refunded` reçu avant le `paid` de la même transaction
ne trouvait aucun règlement à rembourser : la branche `REFUNDED` de
`PaymentGatewayService::applyStatusToPayment` ne faisait rien, l'événement était marqué traité, et
le `paid` qui suivait soldait le payable. Sa relivraison étant dédupliquée (`isAlreadyProcessed`),
le remboursement était perdu.

## Décision du porteur

un `refunded` reçu avant le `paid` de la même transaction est gardé en attente sur le payable (`gateway.pending_refund`, avec un `Log::warning`) et appliqué au `paid` de cette transaction ; test : le scénario mesuré (Wave écrit « Events may arrive out of order », docs.wave.com/webhook, relu le 2026-10-18)

## Objectif utilisateur

L'agence voit remboursé un paiement que le fournisseur a remboursé, quel que soit l'ordre dans
lequel ses deux webhooks sont arrivés.

## Contrat de données

- `metadata.gateway.pending_refund` : liste d'entrées `{transaction_id, amount, currency, at}`,
  une par transaction remboursée avant d'avoir payé ce payable ; l'entrée est retirée quand le
  `paid` de sa transaction l'applique.
- Aucun schéma, endpoint ni ressource modifiés.

## Contraintes strictes (métier)

- Un `refunded` dont la transaction n'a ni soldé le payable ni été marquée doublon est mis en
  attente, avec un `Log::warning` (identifiants seulement).
- Le `paid` de cette transaction applique l'attente :
  - s'il solde le payable, le payable passe à `refunded` par la même écriture qu'un remboursement
    reçu dans l'ordre (`refund_amount` depuis le montant rapporté par le `refunded`, TCK-873) ;
  - s'il est un double encaissement, son entrée `gateway_duplicate_payment` est notée remboursée
    (TCK-871).

## Delta à produire

- [x] `PaymentGatewayService` : mise en attente dans la branche `REFUNDED`, application au `paid`.
- [x] Tests : `tests/Feature/Api/PaymentWebhookRefundTest.php`.

## Critères d'acceptation

- [x] AC1 — Échéance ouverte, checkout `spy_txn_1` : `refunded` reçu d'abord (attente, avertissement
  journalisé), puis `paid` par le webhook Wave signé → `refunded`, `refund_amount = 150000`,
  attente vidée.
- [x] AC2 — Échéance soldée par `spy_txn_1`, `refunded` de `spy_txn_2` reçu avant son `paid` →
  l'échéance reste `paid`, et l'entrée de doublon de `spy_txn_2` est notée remboursée.

## Hypothèses

- « La même transaction » se lit sur l'identifiant du fournisseur, comme partout dans la passerelle.
- Le payable est d'abord enregistré `paid`, puis `refunded`, comme si les deux webhooks étaient
  arrivés dans l'ordre : la matrice des transitions et l'observateur des frais de plateforme voient
  la même suite d'états. La quittance (`LeasePaymentSettledOnline`), qui part à la seule transition
  vers `paid` constatée à la fin du traitement, ne part pas : l'échéance finit `refunded`.

## Hors périmètre

- Le nom réel des événements de remboursement des fournisseurs (P39.05 pour Wave).
- Une attente qui ne serait jamais suivie de son `paid` : elle reste dans le `metadata`, visible.

## Notes d'implémentation

- Ablation : service remis à `pre-dev` (tests gardés) → AC1 rouge (aucune attente posée), AC2
  rouge (entrée de doublon sans `refunded_at`) ; correctif remis → 10 verts dans la classe.
- Piège : `isSettledBy` rend vrai pour le checkout COURANT d'une échéance ouverte (repli sur
  `gateway.transaction_id` sans `settled_by`). Il ne compte donc que sur un payable `paid` ou
  `refunded` pour décider qu'une transaction a déjà payé.
- `late`/`pending` → `refunded` est permis par la matrice, mais pas `failed` → `refunded` : le
  payable est sauvegardé `paid` avant d'être remboursé.
