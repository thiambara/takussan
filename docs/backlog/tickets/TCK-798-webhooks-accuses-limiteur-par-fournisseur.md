---
id: TCK-798
title: "Webhooks d'accusés SMS et WhatsApp : un limiteur nommé par fournisseur, plus large, et un avertissement sur chaque 429"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#69-notificationdeliveryattempt-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-36--webhooks-de-statut-sms-et-whatsapp"
tags: [back, sms, whatsapp, webhooks, rate-limit, pistes]
---

## Contexte

Réf : **P36.07** du fichier de pistes, `validé` (critère accordé : V2, élargir le débit change la
protection du jeton d'URL). Les quatre routes d'accusés portaient `throttle:120,1` par IP, avant
`webhook.journal` : au-delà de 120 accusés par minute depuis une IP de fournisseur, le reste
prenait 429, et aucun refus ne laissait de trace (mesuré par le mesureur : 125 accusés Orange →
5 réponses 429, 120 lignes au journal).

## Décision du porteur

un limiteur nommé par fournisseur, plus large que 120 par minute, et un `Log::warning` sur chaque 429 ; le journal des webhooks reste après le débit

## Delta à produire

- [x] `AppServiceProvider::bootRateLimiters()` : `webhook-sms-orange`, `webhook-sms-mtarget`,
      `webhook-sms-lafricamobile`, `webhook-whatsapp`, 600 par minute et par IP chacun ; la
      réponse d'un refus émet un `Log::warning` (limiteur, IP, route) puis lève la même
      `ThrottleRequestsException` que le débit par défaut.
- [x] Routes `sms-webhooks.php` et `whatsapp-webhooks.php` : `throttle:<limiteur>`, toujours
      avant `webhook.journal`.
- [x] Test : `tests/Feature/Http/Webhook/WebhookThrottleTest.php`.

## Critères d'acceptation

- [x] AC1 — 125 accusés Orange de la même IP en une minute : aucun 429.
- [x] AC2 — Chaque route porte son limiteur nommé, avant le journal ; chacun admet plus de 120
      appels par minute.
- [x] AC3 — Un seau plein rend 429 avec l'enveloppe habituelle et un `Log::warning` qui nomme
      le limiteur ; la route d'un autre fournisseur, même IP, n'est pas refusée.

## Hors périmètre

- La clé par réseau IPv6 (`VisitorFingerprint::network`, P37.01) : les nouveaux limiteurs
  lisent `$request->ip()`, comme ceux que P37.01 convertira.
- Le jeton par fournisseur (P36.04).

## Hypothèses (mode sans humain)

- 600 par minute : au-dessus des 500 accusés qu'un envoi Mtarget peut produire (`batch_max`),
  et cinq fois l'ancien plafond. Le forçage d'un jeton d'URL aléatoire reste hors de portée à
  ce débit ; en production, l'allowlist d'IP borne encore les routes SMS.

## Notes d'implémentation

- Ablation : routes remises à `throttle:120,1` → 3 rouges ; rappel de réponse retiré (pas de
  journalisation) → 1 rouge ; remis → 3 verts.
- Le rappel `->response()` lève la `ThrottleRequestsException` au lieu de rendre une réponse :
  l'enveloppe globale d'un 429 (`bootstrap/app.php`) reste celle des autres débits.
