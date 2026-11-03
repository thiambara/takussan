---
id: TCK-2159
title: "La tentative WhatsApp d'un contact sans compte est journalisée sans notification, et son échec tardif ne fait partir aucun SMS"
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
    - "docs/features.md#14-location-longue-durée-baux"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-207--rappels-planifiés-par-code-marqués-à-la-mise-en-file-face-à-un-envoi-perdu"
tags: [api, whatsapp, notifications, ops, pistes]
---

## Objectif utilisateur

L'exploitation voit les envois WhatsApp aux contacts sans compte : chaque tentative laisse une
ligne `notification_delivery_attempts`, que l'accusé de Meta met à jour et que l'indicateur de
santé WhatsApp compte. Le secours SMS d'un contact sans compte reste réservé à l'échec immédiat.

## Contexte

Réf : **P207.02** du fichier de pistes, `validé`. `WhatsappChannel::logAttempt()` sortait sans
rien écrire quand la notification n'avait pas de ligne `app_notifications`, ce qui est le cas de
tout contact sans compte ; le SMS, lui, écrit sa tentative sans rattachement depuis TCK-799.

## Décision du porteur

> validation du porteur (2026-10-24) : la tentative WhatsApp d'un contact sans compte est journalisée sans notification, comme le SMS (TCK-799) ; le secours SMS d'un contact sans compte ne vaut que pour l'échec immédiat, règle écrite à `docs/features.md`

## Hypothèses (mode sans humain)

- La règle vaut pour toute tentative WhatsApp sans notification (contact sans compte, abonné
  d'alerte sans compte), comme celle du SMS (TCK-799), qui ne distingue pas.
- Ligne écrite dans sa propre transaction ; un échec d'écriture est journalisé sans le numéro et
  n'interrompt pas l'envoi.
- La règle de `docs/features.md` (secours SMS limité à l'échec immédiat) y est déjà écrite
  (relances de loyer, P207.02) ; `SendSmsAfterLateWhatsappFailureJob` écarte déjà toute tentative
  sans `app_notification_id` : rien à y changer, le test le garde.

## Delta à produire

- [x] `WhatsappChannel::logAttempt()` : tentative sans notification écrite, `app_notification_id` nul.

## Critères d'acceptation

- [x] AC1 — Envoi WhatsApp à un contact sans compte : une tentative `whatsapp_cloud`, sans notification, avec l'identifiant de Meta.
- [x] AC2 — Accusé `failed` tardif : la tentative passe `failed`, aucun SMS ne part.
- [x] AC3 — Échec immédiat : la tentative est écrite et le SMS de secours part.

## Notes d'implémentation

- Ablation : retour anticipé remis pour une notification nulle → 2 rouges ; remis → 2 verts.
