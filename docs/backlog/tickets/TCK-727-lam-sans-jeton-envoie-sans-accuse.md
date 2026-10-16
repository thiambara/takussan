---
id: TCK-727
title: "LAfricaMobile : sans SMS_WEBHOOK_URL_TOKEN, envoyer sans accusé de réception"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-27--routeur-sms--double-envoi-sur-un-timeout-suivi-dun-repli"
tags: [back, sms, notifications, pistes]
---

## Contexte

Réf : **P27.01** du fichier de pistes, `validé` par le porteur (critère accordé : V5).

Dès qu'un `notification_id` accompagne l'envoi, `LAfricaMobileSmsDriver` construit le `ret_url` par
`URL::temporarySignedRoute('sms.webhook.lafricamobile', …, ['token' => …])`, hors du `try` de
l'appel HTTP. Le jeton vaut `''` par défaut (`config/sms.php`), et la route exige le segment
`{token}` : la construction lève `UrlGenerationException`, la tentative LAM finit en
`driver_exception_UrlGenerationException`, et le routeur passe au fournisseur suivant (ou à
`no_provider_available`). Tout SMS rattaché à une notification est touché ; seuls les codes OTP et
de step-up, sans `notification_id`, passent.

## Décision du porteur

sans la clé, envoyer sans accusé de réception, avec un `Log::warning` ; pas de refus au démarrage ; reste : poser `SMS_WEBHOOK_URL_TOKEN` dans Dokploy (porteur)

## Reste à faire

poser `SMS_WEBHOOK_URL_TOKEN` dans Dokploy (porteur)

## Objectif utilisateur

Un SMS de notification routé vers LAfricaMobile part même quand l'environnement n'a pas posé
`SMS_WEBHOOK_URL_TOKEN` ; seul son accusé de réception est perdu, et le journal le dit.

## Contraintes strictes (métier)

- Avec le jeton posé, le `ret_url` signé part comme avant.
- Aucun refus au démarrage.

## Delta à produire

- [x] `LAfricaMobileSmsDriver::send()` : jeton vide et `notification_id` posé → `Log::warning` une
  fois par envoi, et aucun `ret_url` dans la charge utile.
- [x] Tests : `SmsRouterDriverTest::test_lam_sends_without_return_url_when_webhook_token_is_missing`,
  `::test_lam_sends_return_url_when_webhook_token_is_set`.

## Critères d'acceptation

- [x] AC1 — Jeton vide, `notification_id` posé, LAM seule intégration : le résultat est
  `lafricamobile` `sent`, la requête vers LAM ne porte pas de `ret_url`.
- [x] AC2 — Dans ce cas, un `Log::warning` nomme `SMS_WEBHOOK_URL_TOKEN`, une seule fois.
- [x] AC3 — Jeton posé : la requête vers LAM porte un `ret_url` qui contient le jeton.

## Hors périmètre

- Les contrôleurs d'accusé de réception (Orange, Mtarget, LAM) lisent le même jeton ; leur
  comportement sans jeton n'est pas touché.
- P27.02 (repli sur un échec ambigu) et P11.05 (`no_provider_available` sans journal).

Hypothèse (mode sans humain) : l'avertissement porte le seul `notification_id`, jamais le numéro
ni le texte du SMS.

## Notes d'implémentation

- Ablation : pilote remis à `pre-dev` (19732e24), le test « missing » rougit
  (`failed` / `driver_exception_UrlGenerationException` au lieu de `sent`), 1 échec sur 17 ; correctif
  remis, 17 verts.
- Le test « set » est vert sans le correctif : il garde l'autre versant (le jeton posé garde son
  `ret_url`), pour qu'un correctif qui retirerait le `ret_url` partout ne passe pas.
