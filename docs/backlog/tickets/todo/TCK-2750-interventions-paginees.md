---
id: TCK-2750
title: "« Interventions » se pagine — les factures des prestataires au-delà des 20 premières deviennent visibles"
status: todo
phase: P1
family: front
estimate: S
wave: 90
created: 2026-11-12
updated: 2026-11-12
depends_on: [TCK-2677]
blocks: []
spec_refs:
  features:
    - "docs/features.md"
tags: [front, finances, argent, pagination, suite-de-tck-2677]
---

## Objectif utilisateur

L'administrateur voit TOUTES les factures des prestataires dans le registre « Interventions » d'« Argent ».

## Constat (TCK-2677, relevé du 2026-11-12)

`useServiceProviderBills` lit `per_page=20` sans page suivante : la base de démo porte 37 factures, 17 ne se
voient pas — avant comme après TCK-2677 (défaut hérité de l'ancien onglet `bills`).

## Delta

La même pagination que les autres registres d'« Argent ».

## Critères d'acceptation

- [ ] AC1 — avec 37 factures, les 37 sont atteignables depuis le registre (au bureau et au téléphone).
- [ ] AC2 — le compte affiché est `meta.total`, pas la longueur de la page.
- [ ] AC3 — changer de filtre revient à la première page.
