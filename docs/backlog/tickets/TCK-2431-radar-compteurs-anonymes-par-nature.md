---
id: TCK-2431
title: "Radar : figer chaque jour des compteurs anonymes par nature d'annonceur, pour mesurer la part d'intermédiaires au-delà de la purge"
status: doing
phase: P3
family: back
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2393]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, radar, observatoire, adr-0077, adr-0083]
---

## Objectif utilisateur

Le porteur connaît la part d'intermédiaires parmi les annonceurs du marché sur toute la durée de la
collecte, pas seulement sur les 90 derniers jours.

## Contexte

L'observatoire (TCK-2393, [ADR-0083](../../adr/0083-l-observatoire-du-marche.md)) compte les annonceurs par
nature présumée à la lecture. La purge (TCK-2391) remet la nature d'un annonceur sans annonce restante à
`unknown` : la mesure ne porte donc que sur les annonceurs encore porteurs d'annonces non purgées.

## Delta à produire

- [ ] Un compteur quotidien anonyme (date, nature, nombre d'annonceurs vus ce jour-là, nombre d'annonces),
      écrit avant la purge, sans identifiant d'annonceur.
- [ ] L'observatoire lit ces compteurs pour la part par nature sur une période.

## Critères d'acceptation

- [ ] AC1 — La part par nature d'une période passée est la même avant et après la purge.

## Hors périmètre

- Une offre « pro solo » (ADR-0077 § 7) : décision à part.

## Notes d'implémentation

_(à remplir par implementing-specs)_
