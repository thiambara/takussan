---
id: TCK-2427
title: "Radar : accusés de livraison du numéro WhatsApp du Radar, et cas d'évaluation des réponses reçues en texte"
status: doing
phase: P3
family: back
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2395]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, radar, whatsapp, ia, adr-0077]
---

## Objectif utilisateur

L'opérateur sait si un message envoyé par l'API est arrivé, et la vérification des réponses texte est
mesurée comme celle des captures.

## Contexte

TCK-2395 envoie par l'API du numéro du Radar et lit les messages reçus sur son webhook
(`webhooks/whatsapp/radar/{token}`), mais :

- les **accusés de livraison** (`statuses` : `delivered`, `read`, `failed`) qui arrivent sur ce même
  webhook ne sont pas lus ; `radar_outreaches.provider_status` reste `accepted` ou `ambiguous` ;
- le prompt `v2` de `radar.verification_accord` classe une réponse texte, mais le jeu d'évaluation
  (`resources/ai/evals/radar.verification_accord`) ne porte que des captures : le texte n'est pas
  mesuré.

## Delta à produire

- [ ] Lire les `statuses` du webhook du Radar : `provider_status` suit `delivered`, `read`, `failed`
      (avec le code Meta), apparié par `provider_message_id`. Un `failed` sur un envoi `ambiguous`
      dit qu'il n'est pas parti.
- [ ] Des cas texte dans le jeu d'évaluation (accord, refus, STOP, question, ambigu, réponse en
      wolof) et le test du jeu étendu ; `php artisan ai:eval radar.verification_accord` joué par le
      porteur (appel payant).

## Critères d'acceptation

- [ ] AC1 — Un accusé `failed` d'un message du Radar passe son `provider_status` à `failed`, journalisé.
- [ ] AC2 — Le jeu d'évaluation joue les cas texte sur le rôle `raisonnement`.

## Hors périmètre

- Le téléchargement des médias reçus (vocaux, images).
