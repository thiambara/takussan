---
id: TCK-010
title: Recherche vocale / langage naturel
status: blocked
phase: P3
family: applicatif
estimate: M
created: 2026-04-15
updated: 2026-04-15
depends_on: [TCK-024]
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#31-integration-
tags: [full-stack, search, ai]
---

## Contexte

Issu du warning `features.md §1.2 P3` (ligne 111), justifié en passe 006 comme
applicatif (frontend + API externe).
**Bloqué** sur décision produit : choix du LLM parser.
Recommandation technique: Claude Haiku 4.5 (rapide, peu coûteux pour parsing structuré).

## Objectif

Permettre à un visiteur de dicter une requête en langage naturel et de la
transformer en filtres structurés via un LLM externe.

## Delta à produire

- [ ] Bouton micro dans `SearchBar` (Web Speech API)
- [ ] Endpoint `POST /api/search/parse` retournant `{ city, type, bedrooms, max_price, min_surface, … }`
- [ ] Service `NlpSearchParserService` (appel LLM + parsing JSON)
- [ ] Fallback : affichage du transcript brut si échec ou ambiguïté
- [ ] Stockage clé API dans `Integration` (`provider = llm_search_parser`)
- [ ] Masquage du bouton si le navigateur ne supporte pas Web Speech API

## Critères d'acceptation

- [ ] « Appartement 2 chambres à Dakar sous 500 000 » → filtres cohérents
- [ ] Un transcript ambigu affiche le texte pour édition manuelle
- [ ] Les filtres produits sont compatibles avec l'endpoint `/api/properties` existant
- [ ] Aucun appel LLM si l'agence n'a pas configuré le provider

## Hors périmètre

- Dialogue multi-tours
- TTS (réponse vocale)

## Notes d'implémentation

_(à remplir par spec-coder)_
