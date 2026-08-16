---
id: TCK-293
title: "Webhook de paiement — le secret de n'importe quelle agence valide celui des autres"
status: todo
phase: P0
family: bug
estimate: M
wave: null
created: 2026-08-16
updated: 2026-08-16
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [back, securite, paiement, multi-agence, decision]
---

## Objectif utilisateur

Qu'un webhook de paiement ne puisse marquer « payé » que ce qu'il concerne réellement — et qu'un
secret confié à une agence n'ouvre rien chez une autre.

## ⚠️ Ce ticket attend un ARBITRAGE avant toute implémentation

Décision du 2026-08-16 : **le constat est acté, la correction est différée.** Ce ticket existe pour
que l'arbitrage ne se perde pas, pas pour être pris en charge par le premier agent qui lit la
colonne Todo. **Ne pas l'implémenter sans que la question ci-dessous ait été tranchée.**

## Ce que la mesure a établi (2026-08-15, ardoise D-50)

`PaymentGatewayService::handleWebhook` (lignes 132-137) résout l'`Integration` **sans aucun scope
d'agence** — la première active du fournisseur — alors que `::initiate`, dix lignes plus haut, la
scope correctement via `resolveIntegration($provider, $agencyId)`. C'est le secret de cette
intégration arbitraire, et lui seul, qui valide les signatures de **toute la plateforme**.

Mesuré avec deux agences ayant chacune leur intégration Wave active et son propre `webhook_secret` :

| Webhook visant le paiement de l'agence A | Attendu | Mesuré |
|---|---|---|
| signé avec le secret de **B** | 401 | **200 — le paiement de A passe à `paid`** |
| signé avec le secret **légitime de A** | 200 | **401** |

Le comportement est donc inversé **dans les deux sens à la fois** : le mauvais secret ouvre, le bon
ferme.

## La question à trancher, et pourquoi elle n'est pas technique

La route est `POST webhooks/payments/{provider}` (`routes/api/payments.php:33`) : **rien n'y
identifie l'agence**. Or il faut l'intégration — donc l'agence — pour vérifier la signature, et il
faut avoir lu la charge utile pour connaître l'agence. Trois sorties possibles, et le choix engage
la configuration chez le fournisseur, pas seulement le code :

1. **Une URL de webhook par agence** (jeton dans le chemin). Le plus net cryptographiquement.
   Coût : chaque agence doit reconfigurer son tableau de bord Wave / Orange Money, et l'onboarding
   d'une nouvelle agence gagne une étape manuelle.
2. **Essai successif des signatures** parmi les intégrations actives du fournisseur, puis
   restriction du rapprochement à l'agence de celle qui a validé. Aucune reconfiguration externe.
   Coût : O(n) vérifications par webhook, et une sémantique de sécurité à écrire noir sur blanc
   (que se passe-t-il si deux agences partagent le même secret ?).
3. **Une intégration unique et globale par fournisseur**, les intégrations par agence étant
   interdites pour les paiements. Le plus simple — *si* c'est le modèle d'affaires réel. À vérifier
   auprès du produit avant tout, parce que ce serait un retrait de capacité.

## Delta à produire

- [ ] Trancher entre les trois sorties ci-dessus (produit + ops).
- [ ] Écrire la décision en ADR — c'est une décision structurelle sur l'isolation par agence, qui
      est le principe non négociable n°2 du dépôt.
- [ ] Implémenter, puis retirer la sonde de `tests/Feature/Api/PaymentWebhookMultiTenantTest.php`
      (elle se rallume seule dès que la résolution est scopée).

## Critères d'acceptation

- [ ] AC1 — un webhook signé avec le secret d'une autre agence est **refusé** (401), et ne mute rien.
- [ ] AC2 — un webhook signé avec le secret légitime de l'agence propriétaire du paiement **passe**.
- [ ] AC3 — le rapprochement d'événement (`paymentsForEvent`) ne peut atteindre que des payables de
      l'agence dont l'intégration a validé la signature.
- [ ] AC4 — un ADR consigne la sortie retenue et le coût opérationnel accepté.

## Hors périmètre

- Les webhooks SMS (Orange, Mtarget) : ni l'un ni l'autre n'offre de signature, c'est acté et
  documenté en ardoise D-31 — problème distinct, contraintes distinctes.

## Notes d'implémentation

Le test `PaymentWebhookMultiTenantTest` existe déjà et sonde la **cause** (l'absence de scope dans la
résolution), pas le symptôme : il se rallumera de lui-même le jour de la correction, sans que
personne n'ait à se souvenir de venir le retirer.
