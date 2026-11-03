---
id: TCK-1356
title: "`DeletionStepUpService::sendCode` rend un booléen « code émis » dans tous les environnements"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#deletionstepupservicesendcode-rend-le-code-hors-production-pour-les-seuls-tests-et-en-production-son-null-ne-distingue-plus--délai-de-renvoi--de--code-envoyé-"
tags: [back, auth, account-deletion, pistes]
---

## Objectif utilisateur

Aucun changement visible : la réponse HTTP du step-up reste le 202 invariant. Le service cesse de
rendre un code à son appelant hors production, et sa valeur rendue dit la même chose partout.

## Contexte

Réf : **P106.02** du fichier de pistes, `validé` (critère V2 cité par le classement, accordé).

Mesuré avant correctif (sur `45fd976b2`) : `sendCode()` rendait `app()->environment('production')
? null : $code` ; en production, `null` valait à la fois « délai de renvoi » et « code émis ». Le
seul appelant de `app/` (`AccountDeletionController::sendStepUpCode`) ignore la valeur ; seuls les
tests la lisaient.

## Décision du porteur

> `sendCode` rend un booléen « code émis » dans tous les environnements, la branche sur `APP_ENV` retirée ; les tests lisent le code par `Notification::fake` ou le pilote SMS de test, comme `OtpPreviewTest` ; un test du `false` sous délai de renvoi garde le contrat (porteur, 2026-10-22)

## Hypothèses (mode sans humain)

- Le refus de la porte des codes SMS (indicatif non servi, plafond du jour) rend aussi `false` :
  aucun code n'est émis.

## Delta à produire

- [x] `DeletionStepUpService::sendCode(): bool`, sans branche sur `APP_ENV`.
- [x] `AccountDeletionStepUpTest` : le code se lit dans `AccountDeletionStepUpCodeNotification`
  simulée (`sendStepUpCode()`), plus dans la valeur rendue.
- [x] Tests : `true` en production quand un code part, `false` sous le délai de renvoi.

## Critères d'acceptation

- [x] AC1 — `APP_ENV=production` : `sendCode()` rend `true` et la notification part.
- [x] AC2 — second appel sous le délai de renvoi : `false`, une seule notification.
- [x] AC3 — la réponse HTTP du step-up est inchangée (202, test existant vert).

## Hors périmètre

- L'aperçu des codes (`OtpPreview`, ADR-0060), inchangé.

## Notes d'implémentation

- Ablation : le service remis à `45fd976b2` → 10 rouges sur 19 dans `AccountDeletionStepUpTest`
  (les deux neufs, et les huit qui lisent désormais le code dans la notification puisque
  `assertTrue` y refuse une chaîne) ; correctif remis → 19 verts.
