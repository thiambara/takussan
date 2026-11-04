---
id: TCK-2047
title: "Le commentaire du repli SMS après un échec tardif de WhatsApp dit que l'agence est recalculée"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-203--agence-dun-compte-lue-hors-requête-http"
tags: [api, notifications, documentation, pistes]
---

## Contexte

Réf : **P203.03** du fichier de pistes, `validé (délégué)`. `SendSmsAfterLateWhatsappFailureJob`
passe `'agency_id' => $user->agency_id` au routeur SMS sous le commentaire « Même agence que
`WhatsappChannel::resolveAgencyId()` » (relu le 2026-10-24, l. 104-105). Rien ne garde l'agence
de l'envoi WhatsApp : ni la tentative, ni la notification. L'égalité affirmée n'est vraie que si
les profils du compte n'ont pas changé entre l'envoi et l'accusé `failed`.

## Décision du porteur (déléguée)

validé (délégué) — corriger seulement le commentaire de `SendSmsAfterLateWhatsappFailureJob` : l'agence est recalculée au moment du repli, et peut différer de celle de l'envoi WhatsApp si les profils du compte ont changé entre-temps ; reste : relire l'agence rangée avec la notification, si P203.01 la range

## Delta à produire

- [x] Le commentaire dit que l'agence est recalculée au repli et peut différer de celle de l'envoi.

## Reste à faire

relire l'agence rangée avec la notification, si P203.01 la range

## Notes d'implémentation

- Commentaire seul, aucun comportement changé : pas de test de garde, et pas d'ablation possible.
