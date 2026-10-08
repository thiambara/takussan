---
id: TCK-293
title: "Webhook de paiement — le secret de n'importe quelle agence valide celui des autres"
status: doing
phase: P0
family: bug
estimate: M
wave: 73
created: 2026-08-16
updated: 2026-10-08
depends_on: []
blocks: [TCK-602]
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

### 2026-10-08 — Arbitrage rendu, re-mesure sur `dev` (2a755b71) avant le code

**Le porteur a tranché le 2026-10-08 : option 1, une URL de webhook par agence** (jeton dans le
chemin). Décision écrite dans ADR-0046.

Re-mesure, la constatation d'août tient **à l'identique** :

- `php artisan test tests/Feature/Api/PaymentWebhookMultiTenantTest.php` → `2 skipped` : la sonde
  lit toujours `handleWebhook` sans scope (`PaymentGatewayService.php:195-210` sur `dev`, et non
  plus 132-137).
- Mesure du ticket rejouée par un test jetable (supprimé dans le même script), deux agences, B
  créée d'abord : secret légitime de A → **HTTP 401**, paiement de A `pending` ; secret de B →
  **HTTP 200**, paiement de A **`paid`**. Inversé dans les deux sens, comme le 2026-08-15.

Écarts relevés en relisant le code qui a bougé depuis août :

- `handleWebhook` porte désormais un `orderByRaw('agency_id IS NULL')` (préférence pour une
  intégration d'agence) : il ORDONNE sans restreindre. Avec deux agences, c'est l'ordre de
  création qui décide.
- `handleWebhookEvent` (chemin du paquet Lemon Squeezy) reproduit la même résolution sans scope,
  et `paymentsForEvent` a un TROISIÈME chemin d'appariement : `custom_data.payment_id` +
  `class_exists($type)` — n'importe quelle classe, n'importe quel identifiant, sans agence.
- `IntegrationService::recordWebhook` rattache toujours le journal à l'intégration globale
  (`whereNull('agency_id')`) : c'est l'objet de TCK-602 (AC9), qui lira l'intégration que 293
  résout.
- `OrangeMoneyDriver.php:47` : `notif_url` fixe (`/api/webhooks/payments/orange_money`), sans
  agence — confirmé.
- **Hors périmètre, relevé pour 602 (§3 de son ticket)** : le formulaire d'agence écrit
  `api_key`/`api_secret`/`webhook_url`, jamais `webhook_secret` que lisent `WaveDriver:101` et
  `OrangeMoneyDriver:106`. Une intégration Wave créée par l'écran rend donc 500 au webhook, avec ou
  sans 293. 602 possède ce formulaire pour la catégorie `payments` ; 293 n'y ajoute que l'URL.
