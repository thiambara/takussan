---
id: TCK-012
title: Recherche sémantique par embeddings
status: blocked
phase: P3
family: technique
estimate: XL
created: 2026-04-15
updated: 2026-04-15
depends_on: [TCK-024]
blocks: []
spec_refs:
  features:
    - docs/features.md#24-recherche--filtres
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#30-setting-
tags: [infra, search, ai, architecture]
---

## Contexte

Issu du warning `features.md §2.4 P3` (ligne 335), reporté en passe 006
(nécessite pgvector ou service dédié).
**Bloqué** sur décision architecturale : le choix entre pgvector local, service
managé (Pinecone/Weaviate/Qdrant) ou hybride Scout+rerank conditionne tout le reste
et peut entraîner une migration MySQL → PostgreSQL.

## Objectif

Permettre une recherche qui comprend l'intention (« maison familiale calme
proche école ») plutôt que les mots-clés exacts, via embeddings vectoriels et
similarité cosinus.

## Décision architecturale requise (avant estimation fine)

| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| **A. pgvector local** | DB unifiée, transactions natives, backup unifié | Migration MySQL→PostgreSQL, indexation lente, maintenance extension |
| **B. Service managé** (Pinecone, Weaviate, Qdrant) | Scaling auto, features avancées (hybrid, rerank) | Coût récurrent, dépendance tierce, synchro |
| **C. Hybride Scout + rerank LLM** | Réutilise l'existant, moindre effort | Qualité intermédiaire, latence, complexité front |

## Delta à produire (post-décision)

- [ ] Route `GET /api/search/semantic?q=…`
- [ ] Job `EmbedPropertyJob` sur `Property::created/updated`
- [ ] Stockage embedding selon option choisie
- [ ] Top-20 avec score ≥ 0.7
- [ ] Toggle front « classique » / « IA »
- [ ] Documentation du coût par 1000 requêtes

## Critères d'acceptation (à affiner post-décision)

- [ ] Latence p95 < 800 ms sur requête type
- [ ] Précision subjective supérieure à la recherche full-text sur 10 requêtes test
- [ ] Reindexation complète scriptée et idempotente

## Hors périmètre

- Recherche d'images par embeddings
- Reconstruction de l'index historique (biens actifs uniquement en v1)

## Notes d'implémentation

_(gelé en attente de la décision architecturale)_
