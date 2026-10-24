---
id: TCK-2197
title: "Renvoyer le code avec un numéro neuf juge le délai et le quota avant d'écrire, et n'annonce le remplacement qu'après l'envoi"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-213--écritures-faites-avant-un-refus-4xx-hors-de-la-transaction-qui-porte-le-refus"
tags: [back, auth, telephone, pistes]
---

## Objectif utilisateur

Le titulaire d'un numéro vérifié qui renvoie un code trop tôt, ou vers un numéro à quota épuisé,
garde son numéro vérifié et ne reçoit pas l'avis « numéro changé » pour un remplacement qui n'a pas
eu lieu.

## Contexte

Réf : **P213.02** du fichier de pistes, `validé`.

Décision du porteur : validation du porteur (2026-10-24) : le délai par compte et le quota du numéro entrant se jugent avant toute écriture ; la branche neutre `isVerifiedElsewhere` reste après l'écriture ; `notifyReplaced` ne part qu'après un `sendOtp` réussi, refus 503 du plafond global compris

Avant (lu, puis mesuré par `PhoneResendAvantEcritureTest`, 3 rouges) : `PhoneVerificationController::resend`
écrit `phone` et `phone_verified_at = null`, puis `notifyReplaced`, avant
`refuseWhileCoolingDown` et `quota->ensureAvailable`.

## Hypothèses (mode sans humain)

- La preuve de remplacement (`PhoneChangeGuard::authorize`) reste jugée la première, comme avant.
- La branche neutre (numéro vérifié par un autre compte) répond comme un envoi réel réussi : l'avis
  du remplacement y part donc aussi, après `neutralSend`. Sans cela, l'absence d'avis distinguerait
  la réponse neutre d'un envoi réel, et le titulaire d'un numéro remplacé ne serait pas prévenu.
- Sur le 503 du plafond global, le numéro reste écrit (la décision ne juge avant l'écriture que le
  délai et le quota) ; seul l'avis est retenu.

## Delta à produire

- [x] `resend` : `refuseWhileCoolingDown` et `quota->ensureAvailable($incoming)` avant l'écriture
  du numéro entrant.
- [x] `notifyReplaced` après un `sendOtp` réussi (et après la réponse neutre).
- [x] Test : `tests/Feature/Auth/Phone/PhoneResendAvantEcritureTest.php`.

## Critères d'acceptation

- [x] AC1 — Renvoi avec un numéro neuf dans le délai de renvoi → 429 `phone.resend_too_soon`,
  `phone` et `phone_verified_at` inchangés, aucun avis.
- [x] AC2 — Numéro entrant à quota épuisé → 429 `phone.send_limit_day`, rien d'écrit, aucun avis.
- [x] AC3 — Plafond global atteint → 503 `sms_capacity_reached`, aucun avis.
- [x] AC4 — Envoi réussi, ou réponse neutre → numéro écrit, un avis.

## Notes d'implémentation

- **Ablation** : contrôleur remis à `HEAD` → 3 rouges sur 5 ; correctif remis → 5 verts.
