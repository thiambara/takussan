---
id: TCK-1360
title: "Garder par un test le 403 d'une liste d'IP vide en `production` sur les trois accusés SMS"
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
  models:
    - "docs/models-spec.md#69-notificationdeliveryattempt-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#le-refus-en-403-dune-liste-dip-vide-en-production-nest-gardé-par-aucun-test--le-retirer-laisse-tout-vert"
tags: [back, securite, webhooks, sms, tests, pistes]
---

## Objectif utilisateur

Aucun changement visible : la seule défense de la production quand les `SMS_*_WEBHOOK_IPS` y
manquent (le 403 de `RestrictIpMiddleware`) ne peut plus disparaître sans qu'un test rougisse.

## Contexte

Réf : **P106.01** du fichier de pistes, `retenu · autonome` (A5 : test ajouté, comportement déjà
écrit dans le code et son docblock).

Mesuré avant correctif (sur `45fd976b2`) : `grep -rn ip_allowlist_not_configured tests` → rien ;
les classes de webhook SMS posent une liste vide et tournent en `testing`, où la branche n'est
jamais prise.

## Delta à produire

- [x] Test : `SmsWebhookEmptyAllowlistInProductionTest` — `$this->app['env'] = 'production'`,
  listes vides, 403 `webhook.ip_allowlist_not_configured` sur `restrict.ip:orange`, `:mtarget`,
  `:lafricamobile` ; tentative inchangée ; hors production, la liste vide laisse passer.

## Critères d'acceptation

- [x] AC1 — chacune des trois routes rend 403 `webhook.ip_allowlist_not_configured` en
  `production` avec une liste vide.
- [x] AC2 — l'accusé refusé laisse la tentative à `sent`.
- [x] AC3 — retirer l'`abort_code` du middleware fait rougir le test.

## Hors périmètre

- Le code du middleware, inchangé.

## Notes d'implémentation

- Ablation : l'`abort_code(403, 'webhook.ip_allowlist_not_configured')` remplacé par un
  commentaire → 4 rouges sur 5 (le cas hors production reste vert, il garde le contraire) ;
  remis → 5 verts.
- `tearDown()` remet `env` à `testing` : l'application est reconstruite à chaque test, mais la
  remise évite qu'un échec en cours de test laisse `production` à la suite de la méthode.
