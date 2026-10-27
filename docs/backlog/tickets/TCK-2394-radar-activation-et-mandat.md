---
id: TCK-2394
title: "Radar lot 4 : relance d'activation des comptes créés pour un annonceur, et publication sous mandat Takussan"
status: todo
phase: P2
family: full
estimate: M
wave: 80
created: 2026-10-26
updated: 2026-10-26
depends_on: [TCK-2389, TCK-2390]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, front, radar, activation, mandat, adr-0077]
---

## Objectif utilisateur

Un annonceur publié pour lui est incité à activer son compte par ce que son annonce lui rapporte
déjà ; et l'annonceur d'accord mais sans envie de compte peut confier la diffusion à Takussan.

## Contexte

Lot 4 du [plan](../../plans/2026-10-26-radar-et-socle-ia.md#les-lots) ; le mandat est le repli de
l'option c arbitrée le 2026-10-26. Ticket de cap. **Le mandat demande son propre ADR** : Takussan y
devient diffuseur pour le compte d'un tiers, ce qui touche les conditions d'utilisation (article 1,
« intermédiaire technique ») et la présentation publique.

## Delta à produire

- [ ] Relance (message `wa.me` préparé, puis automatisée au lot 5) : vues, demandes de contact,
      crédits offerts à l'activation.
- [ ] ADR du mandat, puis sa mise en œuvre.

## Critères d'acceptation

- [ ] AC1 — La relance d'un annonceur cite ses chiffres réels de la semaine.
- [ ] AC2 — Aucune publication sous mandat avant l'acceptation de son ADR.

## Hors périmètre

- L'envoi automatique (TCK-2395).

## Notes d'implémentation

_(à remplir par implementing-specs)_
