---
id: TCK-345
title: "Recherche PostgreSQL (pg_trgm / FTS) : faut-il retirer Meilisearch ?"
status: todo
phase: P3
family: technique
estimate: XL
wave: 44
created: 2026-08-21
updated: 2026-08-21
depends_on: [TCK-344]
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
tags: [back, postgresql, recherche, adr]
---

## Contexte

⚠ **Ce ticket RÉVOQUERAIT [ADR-0008](../../adr/0008-meilisearch-sur-tous-les-environnements.md).**
Il ne s'implémente pas sans un ADR qui le remplace.

Ce qu'il faudrait démonter, mesuré le 2026-08-21 : **7 modèles indexés** (`Property`, `Document`,
`Message`, `Customer`, `MaintenanceRequest`, `Agency`, `User`), le driver forcé **sans repli** dans
`phpunit.xml`, un conteneur de service en CI, et tout l'appareil d'isolation d'index par processus
(`TestSearchIndex`, `MeilisearchBarrier`, dette D-44) — plus TCK-334, encore ouverte.

## L'argument POUR, et il n'est devenu bon que récemment

Il n'existait pas au moment de la migration : **c'est TCK-344 qui le crée**. pgvector et `pg_trgm`
dans la même base, c'est de la **recherche hybride** — sémantique et lexicale, jointes à la donnée
métier — sans second système à exploiter, à sauvegarder, à surveiller et à isoler en test.

Tant que le chatbot n'existe pas, cet argument est théorique. C'est pourquoi ce ticket dépend de
TCK-344 et non de la migration.

## L'argument CONTRE

Meilisearch apporte la tolérance aux fautes de frappe et un classement par pertinence que TCK-281
a précisément travaillé à restituer de bout en bout. `pg_trgm` fait de la similarité de trigrammes,
la FTS fait du lexical avec stemming : **ni l'un ni l'autre n'est un remplaçant direct**, et le
front sénégalais mêle français, wolof et noms propres — le pire cas pour un stemmer.

## Comment trancher

**Par mesure, sur un jeu réel, avant tout démontage.** Prendre un échantillon de requêtes
réellement soumises, jouer les deux moteurs, comparer pertinence et tolérance aux fautes. Un
ticket de cette taille ne se décide pas sur une préférence d'architecture.

## Références

- [ADR-0008](../../adr/0008-meilisearch-sur-tous-les-environnements.md) — la décision à révoquer
- [ADR-0020](../../adr/0020-postgresql-sur-tous-les-environnements.md) — pourquoi ce chantier a été reporté
