---
id: TCK-2393
title: "Radar lot 3 : annonceurs classés et observatoire du marché (prix au m², temps de mise sur le marché, quartiers en manque)"
status: todo
phase: P2
family: full
estimate: XL
wave: 80
created: 2026-10-26
updated: 2026-10-26
depends_on: [TCK-2392]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, front, radar, observatoire, commercial, adr-0077]
---

## Objectif utilisateur

Le porteur voit quels annonceurs pèsent sur le marché (les agences qui ne nous connaissent pas
encore), ce que vaut le mètre carré par quartier, combien de temps un bien reste en ligne, et où
Takussan manque d'annonces.

## Contexte

Lot 3 du [plan](../../plans/2026-10-26-radar-et-socle-ia.md#les-lots). Ticket de cap, à découper.
Il mesurera aussi **la part réelle de courtiers** que le porteur estime à plus de 90 % : l'argument
d'une éventuelle offre « pro solo » (ADR-0077 § 7), qui reste une décision à part.

## Delta à produire

- [ ] Classement des annonceurs (volume, quartiers, gamme de prix, nature présumée) et piste
      commerciale vers la demande de passage en agence.
- [ ] Agrégats anonymes : prix au m² par quartier et type, temps de mise sur le marché (apparition →
      disparition des instantanés), écart d'offre Radar / catalogue par quartier.
- [ ] Alerte quand l'annonce source d'un bien publié disparaît.

## Critères d'acceptation

- [ ] AC1 — Les agrégats survivent à la purge (ils ne lisent que des données anonymes).
- [ ] AC2 — Une annonce source disparue lève une alerte sur le bien publié correspondant.

## Hors périmètre

- Une offre « pro solo » et tout retour du courtier dans le code (ADR-0030).

## Notes d'implémentation

_(à remplir par implementing-specs)_
