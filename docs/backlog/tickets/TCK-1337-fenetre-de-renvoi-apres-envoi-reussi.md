---
id: TCK-1337
title: "Code de signature de bail : la fenêtre de renvoi ne compte qu'après un envoi réussi"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-123--appels-réseau-entre-un-geste-validé-et-sa-trace-ou-sa-notification"
tags: [back, baux, signature, pistes]
---

## Contexte

Réf : **P123.06** du fichier de pistes, `validé` par le porteur.

`LeaseSignatureService::sendCode()` émettait le code par `LeaseSignatureOtpService::issue()`, qui
pose la fenêtre de renvoi de 60 s, puis l'envoyait. Un courriel qui lève rendait 500, et un nouvel
essai immédiat butait sur 429 `lease_signature.resend_too_soon` ; de même après un SMS non parti
(503, TCK-799).

## Décision du porteur

validé — porteur (2026-10-22) : ne compter la fenêtre de renvoi qu'après un envoi réussi ; la valeur de `SCOUT_*` alignée sur la préproduction (P123.03), écrite à un seul endroit avec sa raison

## Reste à faire

La valeur de `SCOUT_*` alignée sur la préproduction (P123.03), écrite à un seul endroit avec sa
raison : elle passe par les `.env*`, chemin fermé à l'implémenteur, et la valeur de la
préproduction se relève dans Dokploy, hors du poste. P123.03 est rendue au porteur pour la même
raison.

## Objectif utilisateur

Un signataire dont le code n'est pas parti peut en redemander un aussitôt.

## Contrat de données

Aucun code d'erreur neuf : 500 (courriel) et 503 `lease_signature.sms_not_sent` (SMS) inchangés.

## Delta à produire

- [x] `LeaseSignatureOtpService::releaseResend()` : retire la fenêtre de renvoi, sans toucher au
  compteur d'essais (VERIF-596 m1).
- [x] `sendCode()` : la fenêtre est retirée quand l'envoi lève ou que le SMS n'est pas parti.
- [x] Deux tests dans `tests/Feature/Api/LeaseSignatureTest.php`.

## Critères d'acceptation

- [x] AC1 — courriel qui lève : 500, puis aussitôt 202 par courriel.
- [x] AC2 — SMS non parti : 503, puis aussitôt 202 par SMS.
- [x] AC3 — un envoi réussi garde la fenêtre de 60 s (`test_a_resend_waits_sixty_seconds`).

## Notes d'implémentation

- Ablation : `app/Services/Lease` remis à l'origine → AC1 et AC2 rouges (429), remis → 51/51.
- Le plafond horaire des SMS (canal) n'est pas touché : un SMS refusé par le routeur n'est pas parti.
