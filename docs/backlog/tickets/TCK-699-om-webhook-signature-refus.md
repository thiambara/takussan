---
id: TCK-699
title: "Le webhook Orange Money a ses tests de refus de signature (fausse, absente, secret d'une autre agence)"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
  models:
    - docs/models-spec.md#31-integration-
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-12--tests--zones-non-gardées-tests-verts-sans-leur-code
tags: [api, payments, webhooks, tests, pistes]
---

## Contexte

Réf : **P12.03** du fichier de pistes, `retenu · autonome` (classement A5 : garde ajoutée sur une
vérification existante, sans toucher au code ni à un seuil).

`OrangeMoneyDriver::handleWebhook()` refuse en 401 (`webhook.signature_invalid`) une notification
dont l'en-tête `X-OM-Signature` n'est pas le HMAC-SHA256 du corps par le `webhook_secret` de
l'intégration (ADR-0046). Le seul test du chemin (`PaymentDriverTest::test_orange_money_handles_webhook_paid`)
envoie une signature valide. Reproduit le 2026-10-16 : vérification neutralisée (`true || …`),
`PaymentDriverTest`, `PaymentWebhookTest`, `PaymentWebhookEndpointTest`,
`PaymentWebhookMultiTenantTest` et `PaymentDriverErrorLeakTest` restent verts (49 tests, 279
assertions) — le webhook accepterait n'importe quel corps et solderait le paiement.

## Objectif

Une régression de la vérification de signature Orange Money fait rougir la suite.

## Delta à produire

- [x] `tests/Feature/Api/OrangeMoneyWebhookSignatureTest.php`, de bout en bout sur
      `POST /api/webhooks/payments/orange_money/{token}` : deux agences, chacune avec son
      intégration Orange Money et son secret ; un acompte en attente de l'agence A, initié par
      l'intégration de A.
- [x] Trois refus sur l'URL de A — signature fausse, signature absente, corps signé par le secret
      de B — chacun en 401 `webhook.signature_invalid`, paiement resté `pending`, sans `paid_at`
      ni `gateway_events`.
- [x] Un cas témoin : le même corps signé par le secret de A solde le paiement, ce qui prouve que
      les refus viennent de la signature et non de la fixture.

## Critères d'acceptation

- [x] AC1 — Avec le code actuel, les quatre tests sont verts.
- [x] AC2 — Sans la vérification de `handleWebhook()`, les trois refus sont rouges.

## Hypothèses (mode sans humain)

- Le message rendu est la traduction de `errors.webhook.signature_invalid` : le test compare à
  `__()` plutôt qu'à une chaîne en dur, pour ne pas dépendre de la langue de la requête.

## Hors périmètre

- Le code de `OrangeMoneyDriver`, juste aujourd'hui.
- La fenêtre de temps d'une signature (P12.04, pour Wave, à valider) ; Orange Money ne signe aucun
  horodatage.
- Le format réel des notifications d'Orange Money, que P04.06 attend sur un exemple réel.

## Notes d'implémentation

- Ablation : condition de `abort_code_unless` remplacée par `true || …` → les trois refus
  **rouges** (« Expected response status code [401] but received 200 »), le témoin vert. Code
  remis : 4 verts (17 assertions).
- Le message d'erreur est traduit (`Invalid signature.`) : `abort_code` rend la clé
  `errors.webhook.signature_invalid`, pas `webhook.signature_invalid`.
