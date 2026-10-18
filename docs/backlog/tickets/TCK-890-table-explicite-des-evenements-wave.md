---
id: TCK-890
title: "Les événements de webhook Wave se lisent dans une table explicite, et un nom inconnu est ignoré"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: [TCK-889]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#15-leasepayment-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-39--webhooks-de-paiement-refund-et-failed-sur-un-paiement-déjà-soldé"
tags: [back, payments, webhooks, wave, pistes]
---

## Contexte

Réf : **P39.05** du fichier de pistes, `validé` par le porteur (critère accordé : V1). `WaveDriver`
devinait le type d'un événement par `str_contains`, `completed`/`succeeded` d'abord, `refund` en
dernier : un nom comme `refund.completed` soldait un payable ouvert, et tout nom inconnu devenait
`pending`.

## Décision du porteur

une table explicite des événements Wave, relevée le 2026-10-18 sur docs.wave.com/webhook : `checkout.session.completed` → payé, `checkout.session.payment_failed` → échec, `test.test_event` → 200 sans effet ; `merchant.payment_received`, `b2b.payment_received`, `b2b.payment_failed` et tout nom inconnu sont journalisés et ignorés ; la page ne documente aucun événement de remboursement ; un test par nom

## Objectif utilisateur

Un webhook Wave ne change l'état d'un paiement que pour un événement que Wave documente comme tel.

## Contrat de données

- `PaymentEvent::TYPE_IGNORED` (`ignored`) : un événement authentifié qui n'agit sur aucun
  payable. La réponse du webhook rend `type: ignored`, en 200.
- Aucun schéma ni endpoint modifiés.

## Contraintes strictes (métier)

- La table de `WaveDriver` est la décision du porteur, nom pour nom ; aucun nom n'est deviné.
- Un événement ignoré n'écrit rien sur le payable (ni statut, ni `gateway_events`), et n'exige pas
  d'identifiant de transaction.
- Les noms documentés ignorés et les noms inconnus laissent une trace au journal applicatif
  (identifiants seulement) ; `test.test_event` non.

## Delta à produire

- [x] `PaymentEvent::TYPE_IGNORED`.
- [x] `WaveDriver::handleWebhook` : table explicite.
- [x] `PaymentGatewayService` : un événement ignoré n'est rapproché d'aucun payable.
- [x] Tests : `tests/Feature/Api/WaveWebhookEventTableTest.php`, un cas par nom.
- [x] `PaymentWebhookTest::test_paid_payment_is_not_regressed_to_pending_on_late_event` envoyait
  `checkout.session.pending`, nom que Wave ne documente pas : il garde le même comportement du
  service par un événement `pending` appliqué directement.

## Critères d'acceptation

- [x] AC1 — `checkout.session.completed` solde l'échéance ouverte.
- [x] AC2 — `checkout.session.payment_failed` trace l'échec du checkout, l'échéance garde son statut.
- [x] AC3 — `test.test_event`, sans identifiant de transaction → 200, `type: ignored`, rien d'écrit.
- [x] AC4 — `merchant.payment_received`, `b2b.payment_received`, `b2b.payment_failed`,
  `checkout.session.refunded` et `refund.completed` → 200, `type: ignored`, échéance inchangée,
  trace au journal.

## Hypothèses

- Le journal des webhooks (`IntegrationWebhookLog`) garde déjà chaque requête reçue ; « journalisé »
  s'entend en plus d'un `Log::info` (nom documenté) ou `Log::warning` (nom inconnu) nommant
  l'événement.

## Hors périmètre

- Orange Money et Lemon Squeezy, dont les tables restent celles d'aujourd'hui.
- `WaveDriver::verify()`, qui lit le statut de la session et non un nom d'événement.

## Notes d'implémentation

- Reproduit avant correctif (test temporaire, retiré) : `refund.completed` → 200, type `paid`,
  échéance `paid` ; `checkout.session.refunded` → `refunded` ; `merchant.payment_received` →
  `pending` ; `b2b.payment_failed` → `failed`.
- Ablation : `WaveDriver` remis à `pre-dev` (constante et service gardés) → 6 rouges sur 8
  (`test.test_event` en 422 faute d'identifiant ; les cinq noms hors table rendent un autre type) ;
  correctif remis → 8 verts.
- Un événement ignoré n'annote pas `matched_count` : à 0, le journal des webhooks l'aurait lu
  comme un « non apparié ».
