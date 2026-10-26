---
id: TCK-344
title: "Chatbot sur Laravel AI SDK, avec pgvector pour la recherche sémantique"
status: todo
phase: P3
family: applicatif
estimate: XL
wave: 43
created: 2026-08-21
updated: 2026-10-26
depends_on: [TCK-2383]
blocks: []
spec_refs:
  features:
    - docs/features.md
tags: [back, front, postgresql, ia]
---

## Contexte

C'est **le motif qui a fait pencher la migration vers PostgreSQL**, et il est le seul des quatre
à ne rien demander au schéma aujourd'hui.

Ce qui a été acté par ADR-0020 : **le provisionnement**, pas le schéma. L'image est
`pgvector/pgvector:pg17` partout — poste, CI, et le serveur le jour où il existera — et
`docker/pgsql-init.sql` n'installe **aucune** extension. Mesuré le 2026-08-21 :

```
SELECT name, default_version FROM pg_available_extensions WHERE name = 'vector';
→ vector | 0.8.6          (disponible)
SELECT extname FROM pg_extension;
→ plpgsql                 (et rien d'autre : elle n'est PAS installée)
```

*Une extension créée « au cas où » est une dépendance que personne n'a décidée.* Elle s'installe
avec la migration qui en a besoin — c'est-à-dire ici.

## Ce qu'il y a à faire

1. `CREATE EXTENSION vector` dans une migration, avec son `down()`.
2. Le schéma des embeddings : quoi vectoriser (biens ? documents ? conversations ?), quelle
   dimension, quel modèle — et **le modèle décide de la dimension**, donc en changer plus tard
   est une remigration.
3. Le choix d'index : `hnsw` (rapide en lecture, coûteux à construire) contre `ivfflat`.
4. L'intégration Laravel AI SDK côté API, et la surface côté front.

## ⚠ Le risque à lever en premier

**L'hébergement doit autoriser `CREATE EXTENSION vector`.** Une instance managée qui le refuse
ferme ce ticket en silence, et on ne le découvre qu'ici — des mois après la migration. Le
vérifier AVANT d'écrire quoi que ce soit :

```sql
SELECT 1 FROM pg_available_extensions WHERE name = 'vector';
```

C'est la seule raison pour laquelle ADR-0020 a embarqué l'image plutôt que de la remettre à ce
ticket.

## Le socle IA (2026-10-26)

Ce ticket ne pose plus son intégration IA lui-même : il **déclare des usages** au socle
d'[ADR-0076](../../adr/0076-le-socle-ia.md) (TCK-2383), qui choisit le modèle, tient le budget et
journalise. La table `embeddings` est dessinée par ADR-0076 § 11 ; la crée **le premier de ses
usagers** à être implémenté, ce ticket ou TCK-2392 (lot 2 du Radar).

## Références

- [ADR-0020](../../adr/0020-postgresql-sur-tous-les-environnements.md) §2 — pourquoi l'image et pas le schéma
