---
id: TCK-2392
title: "Radar lot 2 : collecte automatique planifiée (Expat-Dakar, CoinAfrique), instantanés datés et fusion des doublons entre sources"
status: todo
phase: P2
family: full
estimate: XL
wave: 80
created: 2026-10-26
updated: 2026-10-26
depends_on: [TCK-2387]
blocks: [TCK-2393]
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, front, radar, collecte, pgvector, adr-0077, adr-0076]
---

## Objectif utilisateur

La liste à démarcher se remplit pendant la nuit : le Radar trouve lui-même les nouvelles annonces,
suit leurs changements de prix, et ne présente qu'une fiche pour la même maison vue sur trois sites.

## Contexte

Lot 2 du [plan](../../plans/2026-10-26-radar-et-socle-ia.md#les-lots). Ticket de cap : il sera
découpé (un ticket par adaptateur au moins) quand le lot 1 aura éprouvé l'extraction sur de vraies
annonces. Le service de collecte séparé (Playwright) n'est envisagé que si la lecture depuis l'API
échoue face aux protections des sites.

## Delta à produire

- [ ] Un adaptateur par site (pages de liste, pagination, URL d'annonce), qui ne fait que fournir
      des URL à la chaîne du lot 1.
- [ ] Passages planifiés, journal des passages (`radar_crawl_runs`), fréquence par domaine,
      `robots.txt`.
- [ ] Instantanés datés d'une annonce (`radar_listing_snapshots`) : prix, présence, texte.
- [ ] Table `embeddings` d'ADR-0076 § 11 (si TCK-344 ne l'a pas déjà créée), extension `vector`
      par migration avec son `down()`, et la similarité de texte comme quatrième signal de
      rapprochement.
- [ ] Fusion : une fiche, plusieurs provenances.

## Critères d'acceptation

- [ ] AC1 — Un passage sur une page de liste semée crée une annonce par URL nouvelle, aucune pour
      une URL déjà connue.
- [ ] AC2 — Un prix changé entre deux passages laisse deux instantanés.
- [ ] AC3 — La même annonce vue sur deux sites devient une fiche à deux provenances.

## Hors périmètre

- Airbnb. L'observatoire du marché (TCK-2393).

## Notes d'implémentation

_(à remplir par implementing-specs)_
