---
id: TCK-678
title: "Le SMS reporté la nuit attend chiffré dans la file, et tout job portant un texte de SMS doit l'être"
status: done
phase: P0
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#23-notifications
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-11--notifications--doublons-préférences-échecs
tags: [back, notifications, sms, file, pistes]
---

## Contexte

Réf : **P11.03** du fichier de pistes, `validé` par le porteur (critère accordé : V3).

Entre 22 h et 6 h, `SmsRouterDriver::deferAll()` remet le texte **déjà rendu** d'un SMS non
critique à `SendDeferredSmsJob`, retardé jusqu'à la fin de la fenêtre ARTP. Ce job n'implémentait
que `ShouldQueue` : le texte, avec ses liens porteurs (`payment_url`, `receipt_url`, lien
d'invitation), et le numéro attendaient en clair dans la table `jobs`. `CodedNotification`, elle,
est chiffrée exprès depuis TCK-602.

## Décision du porteur

ShouldBeEncrypted sur SendDeferredSmsJob, et un test qui l'exige de tout job portant un texte de SMS

## Objectif

La charge d'un SMS reporté ne laisse en clair ni son texte ni son numéro dans la file, et un job
neuf qui porterait un texte de SMS ne peut pas l'oublier.

## Delta à produire

- [x] `SendDeferredSmsJob` implémente `ShouldBeEncrypted`.
- [x] Test `SmsRouterDriverTest::test_deferred_sms_is_stored_encrypted_in_the_jobs_table`, sur la
      file `database` : la charge écrite dans `jobs` ne contient ni le jeton du lien ni le numéro,
      et se déchiffre en un texte qui les contient.
- [x] Garde `tests/Unit/Architecture/JobSmsChiffreTest.php` : toute classe de `app/` mise en file
      qui cite l'API d'envoi de SMS implémente `ShouldBeEncrypted`.

## Critères d'acceptation

- [x] AC1 — Un SMS non critique envoyé à 23 h 30 laisse une ligne dans `jobs` dont la charge ne
      contient ni `jeton-porteur-secret` ni `221771234567`.
- [x] AC2 — La même charge, déchiffrée, porte le texte du SMS.
- [x] AC3 — La garde rougit si `SendDeferredSmsJob` perd `ShouldBeEncrypted`, et si elle ne le
      trouve plus.

## Hypothèses (mode sans humain)

- « Job portant un texte de SMS » : une classe de `app/` qui implémente `ShouldQueue` et cite
  `SmsDriverInterface` ou `SmsRouterDriver`, c'est-à-dire qui remettra un texte au pilote. Les
  notifications sont exclues : elles sérialisent leurs modèles et rendent leur texte à l'envoi
  (`NewBookingNotification`), et `CodedNotification`, qui porte ses paramètres, est déjà chiffrée.
- Les jobs déjà en file au déploiement restent lisibles : `CallQueuedHandler::getCommand()`
  désérialise une charge qui commence par `O:` et ne déchiffre que les autres.

## Hors périmètre

- Les SMS de la file au moment du déploiement restent en clair jusqu'à leur exécution, au matin.
- Les autres jobs qui portent une donnée personnelle sans passer par l'API SMS ne sont pas
  inventoriés par cette garde.

## Notes d'implémentation

- Rouge avant correctif : la charge de `jobs` portait le lien et le numéro en clair ; la garde
  nommait `App\Jobs\SendDeferredSmsJob`.
- Ablation : `ShouldBeEncrypted` retiré, les deux tests rougissent (2 échecs sur 16) ; remis, 16
  verts.
- La charge est du JSON : le nom de classe y est échappé (`App\\Jobs\\…`). Le test lit
  `displayName` après décodage.
