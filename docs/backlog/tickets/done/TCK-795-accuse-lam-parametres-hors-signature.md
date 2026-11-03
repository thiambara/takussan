---
id: TCK-795
title: "Accusé LAfricaMobile : les paramètres ajoutés par LAM sont exclus de la vérification de signature"
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
tags: [back, sms, webhooks, pistes]
---

## Contexte

Réf : **P36.01** du fichier de pistes, `validé` (critère accordé : V2, le correctif desserre la
signature qui authentifie le rappel). Le pilote LAM envoie un `ret_url` signé par
`URL::temporarySignedRoute` avec le seul jeton et l'identifiant de notification ; LAM y ajoute
`push_id`, `ret_id`, `to`, `status` et `text` au rappel. La signature de Laravel couvrant toute la
chaîne de requête, le middleware `signed` de la route et `hasValidSignature()` du contrôleur
refusaient tout accusé réel en 403. Les tests signaient une URL contenant déjà ces paramètres,
que le pilote ne produit jamais.

## Décision du porteur

exclure de la vérification les paramètres ajoutés par LAM (`push_id`, `ret_id`, `to`, `status`, `text`), dans le middleware `signed` de la route comme dans le contrôleur ; tests réécrits depuis le `ret_url` réellement émis par le pilote ; reste : confirmer sur un vrai rappel de LAM

## Reste à faire

confirmer sur un vrai rappel de LAM

## Delta à produire

- [x] `LAfricaMobileSmsStatusController::LAM_QUERY_PARAMS` ; le contrôleur vérifie par
      `hasValidSignatureWhileIgnoring()`.
- [x] Route `sms.webhook.lafricamobile` : `signed:push_id,ret_id,to,status,text` (liste prise de
      la constante).
- [x] `LAfricaMobileSmsWebhookTest` réécrit depuis le `ret_url` capturé dans la requête sortante
      du pilote ; `WebhookJournalTest` (AC7 de TCK-602) aligné.

## Critères d'acceptation

- [x] AC1 — Le `ret_url` émis par le pilote, augmenté des paramètres de LAM, applique l'accusé
      (200, tentative `delivered`).
- [x] AC2 — Une URL dont la notification ou l'expiration a été changée est refusée en 403.
- [x] AC3 — Un `ret_url` expiré (au-delà de 7 jours) est refusé en 403.
- [x] AC4 — Un mauvais jeton d'URL reste refusé en 404, une URL non signée en 403.

## Hors périmètre

- La précédence des statuts poussés (P36.02, TCK-796) et les statuts intermédiaires (P36.03).
- Le jeton par fournisseur (P36.04).

## Hypothèses (mode sans humain)

- LAM ajoute ses paramètres au `ret_url` sans le remplacer : lecture du docblock et de
  `docs/integrations/sms.md`, non une capture d'un rappel réel (c'est le reste à faire).
- Les paramètres de LAM ne sont plus couverts par la signature : un tiers qui détient un
  `ret_url` peut y mettre le statut qu'il veut, dans la fenêtre de 7 jours. Le jeton d'URL,
  l'allowlist d'IP et l'identifiant de notification restent les gardes ; c'est le prix de la
  décision.

## Notes d'implémentation

- Ablation : filtre retiré de la route seule → 3 rouges (403 du middleware) ; retiré du
  contrôleur seul → 2 rouges (403 du contrôleur) ; remis → 6 verts. Les deux exclusions sont
  nécessaires.
- Le middleware `signed` prend la liste à ignorer en arguments (`ValidateSignature::handle`),
  ce qui la borne à cette route : `ValidateSignature::except()` l'aurait appliquée à toutes les
  routes signées.
