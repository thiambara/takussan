---
id: TCK-2576
title: WhatsApp au premier rang des fiches d'agence et d'agent — l'API publique le sert
status: todo
phase: P1
family: api
estimate: S
wave: 85
created: 2026-11-09
updated: 2026-11-09
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [api, front, directory, audit-ux]
---

## Objectif utilisateur

Sur la fiche d'un agent ou d'une agence, le visiteur écrit d'abord sur WhatsApp (décision 4a du
porteur, maquettes D d'agence et d'agent : WhatsApp au premier rang, puis Appeler, puis Message) —
mais seulement quand le numéro publié est bien sur WhatsApp.

## Constat (relevé du 2026-11-09, revue de TCK-2522 / TCK-2523)

- La donnée existe : `users.phone_whatsapp` et `secondary_phone_whatsapp` (TCK-633, lot C), servis
  à l'utilisateur lui-même (`UserResource`) et résumés sur la fiche d'un bien
  (`primary_contact.has_whatsapp`, `PropertyContactNumbers::hasWhatsApp`).
- `GET /api/public/agents/{slug}` ne la sert pas (clés : `phone`, `phone_verified`, aucune
  `*whatsapp*`), ni `GET /api/public/agencies/{slug}` (`phone` seul ; aucune colonne WhatsApp sur
  `agencies`).
- Le front (`ContactDeFiche`) n'affiche donc pas WhatsApp : un bouton qui viserait un numéro hors
  WhatsApp mentirait (TCK-633, lot C).

## Delta à produire

- [ ] API, fiche d'agent : `phone_whatsapp` (booléen) servi avec `phone`, et seulement quand le
  numéro est publié (vérifié, même règle que `numeroPrincipalPublic()`).
- [ ] API, fiche d'agence : décider la source (numéro de l'agence déclaré WhatsApp — colonne à créer,
  ou administrateur de l'agence) ; écrire la décision ici avant de l'implémenter.
- [ ] Front, `ContactDeFiche` : WhatsApp au premier rang quand l'API le dit, lien `wa.me` sur le
  numéro publié ; Appeler, puis Message, ensuite. Clés i18n `fr`/`en`/`wo`.

## Critères d'acceptation

- [ ] AC1 — Un agent au numéro vérifié et déclaré WhatsApp : la barre d'actions commence par
  WhatsApp, lien `wa.me` sur ce numéro.
- [ ] AC2 — Numéro non vérifié, ou vérifié mais non déclaré WhatsApp : aucun bouton WhatsApp, et
  aucun champ WhatsApp dans la réponse publique pour un numéro non publié.
- [ ] AC3 — Même règle sur la fiche d'agence, selon la source décidée.

## Hors périmètre

- Le propriétaire : aucun numéro n'est publié sur sa fiche (TCK-2523).

## Notes d'implémentation

_(à remplir par implementing-specs)_
