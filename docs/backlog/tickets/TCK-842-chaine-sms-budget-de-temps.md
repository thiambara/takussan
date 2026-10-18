---
id: TCK-842
title: "Routeur SMS : la chaîne de repli tient dans un budget de temps, et les jobs qui envoient un SMS lui survivent"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#69-notificationdeliveryattempt-"
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-27--routeur-sms--double-envoi-sur-un-timeout-suivi-dun-repli
tags: [back, sms, notifications, queue, pistes]
---

## Contexte

Réf : **P27.04** du fichier de pistes, `validé` (V5 accordé).

Chaque appel HTTP d'un pilote SMS avait son propre `timeout(10)`, sans borne d'ensemble. Sur un
numéro Orange, un code à usage unique (qui garde le repli même sur un délai dépassé, TCK-766)
enchaînait jeton, envoi en 401, nouveau jeton, renvoi, LAfricaMobile puis Mtarget : **60 s
mesurées** au pire (test, chaque appel consommant tout son délai), et jusqu'à 70 s avec les
attentes du verrou OAuth. Le worker tourne sans `--timeout` (60 s par défaut) et aucun job qui
envoie un SMS ne déclarait `$timeout` : un job tué en cours de chaîne est rejoué (`--tries=3`) et
repart d'Orange.

## Décision du porteur

validé — borner la durée totale de la chaîne dans le code et poser `$timeout` sur le job ; reste : le délai du worker, au déploiement (porteur)

## Reste à faire

le délai du worker, au déploiement (porteur)

## Objectif utilisateur

Un SMS (notification, code, relance) n'est jamais renvoyé parce que son job a été tué en cours
d'envoi, et l'utilisateur qui attend un code n'attend pas plus de 30 s la fin de la chaîne.

## Hypothèses (mode sans humain)

- **Budget de 30 s** pour une traversée de la chaîne (`SmsTimeBudget::CHAIN_SECONDS`), en
  constante et non en configuration : aucune variable d'environnement neuve (V5 hors de portée de
  l'agent), et 30 s laisse un appel complet à chacun des trois fournisseurs.
- **`$timeout` = budget + 20 s = 50 s** sur `CodedNotification`, `NewBookingNotification` et
  `SendDeferredSmsJob` : la chaîne, un appel WhatsApp (10 s, qui se replie en SMS dans le même
  job), une marge ; sous le `retry_after` des files (90 s par défaut). Le `$timeout` d'un job
  l'emporte sur le `--timeout` du worker.
- Une notification met en file une copie par canal : le `$timeout` vaut aussi pour la copie
  e-mail, ce qui ne gêne pas (un envoi SMTP tient bien en 50 s).
- `LeaseSignatureCodeNotification` et les codes de `PhoneVerificationService` /
  `DeletionStepUpService` partent en synchrone : seul le budget les concerne.

## Delta à produire

- [x] `SmsTimeBudget` : échéance posée dans le contexte par le routeur, temps restant, délai d'un
      appel borné au temps restant.
- [x] `SmsRouterDriver` : aucun pilote ne démarre une fois le budget épuisé ; les numéros restants
      finissent en `failed` / `time_budget_exhausted` (tentative écrite, `Log::warning`).
- [x] Pilotes Orange, LAfricaMobile, Mtarget : chaque appel (attente du verrou OAuth comprise)
      borné au temps restant ; aucun appel lancé sans temps (`*_time_budget_exhausted`).
- [x] `$timeout` sur les trois jobs.
- [x] `tests/Feature/Services/Sms/SmsChainTimeBudgetTest.php`.

## Critères d'acceptation

- [x] AC1 — Pire cas d'un code à usage unique sur Orange (chaque appel consomme tout son délai) :
      la chaîne finit en 30 s au plus, aucun appel ne peut finir après l'échéance, et le résultat
      est `failed` / `time_budget_exhausted`, non ambigu.
- [x] AC2 — Une chaîne rapide (Orange en 400, LAfricaMobile accepte) n'est pas coupée.
- [x] AC3 — Les trois jobs déclarent un `$timeout` entier au-dessus du budget + 10 s et sous le
      `retry_after` des files.

## Hors périmètre

- Le `--timeout` du worker dans `deploy/` : reste du porteur.
- Le délai de l'appel WhatsApp Cloud (`CloudApiWhatsappDriver`, un seul appel de 10 s) : non borné
  par le budget SMS, compté dans la marge du `$timeout`.

## Notes d'implémentation

- **Le faux HTTP mesure le pire cas** : chaque appel avance l'horloge (`Carbon::setTestNow`) de
  tout le délai qu'on lui passe (`$options['timeout']`, que le faux de Laravel reçoit). Sans cela,
  un délai réduit ne se verrait pas.
- **Ablation** : `app/` rendu à `pre-dev` → AC1 rouge (60 s) et AC3 rouge (`$timeout` absent) ;
  pilotes seuls rendus à `pre-dev`, routeur gardé → AC1 rouge (40 s : Orange seul épuise le
  budget). Remis : 3 verts ; `tests/Feature/Services/Sms`, `Services/Whatsapp`, `tests/Unit/Services`
  verts (295 tests).
