---
id: TCK-2432
title: "Radar : bien publié dont l'annonce source a disparu — demander au titulaire si le bien est toujours disponible"
status: todo
phase: P3
family: full
estimate: M
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2393]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, front, radar, observatoire, notifications, adr-0077, adr-0083]
---

## Objectif utilisateur

Un bien publié par le Radar ne reste pas en ligne des semaines après avoir été loué ou vendu ailleurs.

## Contexte

TCK-2393 lève une alerte (`radar_source_listing_gone`) quand l'annonce source d'un bien publié disparaît :
elle prévient l'équipe par les règles d'alerte de la console, rien de plus. Le titulaire du bien n'en sait
rien, et le bien reste public.

## Delta à produire

- [ ] À la disparition, une notification au titulaire du bien (« votre bien est-il toujours disponible ? »),
      avec un geste pour le marquer loué, vendu ou toujours disponible.
- [ ] Sans réponse après un délai en configuration, une proposition de retrait à l'équipe (jamais un
      retrait automatique).

## Critères d'acceptation

- [ ] AC1 — La disparition d'une source notifie le titulaire une seule fois par disparition.

## Hors périmètre

- Retirer le bien automatiquement.

## Notes d'implémentation

_(à remplir par implementing-specs)_
