---
id: TCK-344
title: "Chatbot sur Laravel AI SDK, avec pgvector pour la recherche sémantique"
status: todo
phase: P3
family: applicatif
estimate: XL
wave: 43
created: 2026-08-21
updated: 2026-11-16
depends_on: [TCK-2383]
blocks: []
spec_refs:
  features:
    - docs/features.md
tags: [back, front, postgresql, ia]
---

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : partiellement fermé.** Le socle pgvector et le risque d'hébergement sont levés par
TCK-2423 ; le chatbot n'existe pas (aucun code, aucune spec ; `config/ai.php` n'a qu'un rôle
`embedding`, servi au Radar). Dépendance TCK-2383 : done.

- **Fermé par TCK-2423** : `CREATE EXTENSION IF NOT EXISTS vector` et la table `embeddings`
  (migration `2026_10_31_242300`, `app/Services/Ai/EmbeddingsTable.php`, `down()` → `uninstall()`),
  facultatifs (la migration réussit sans l'extension), **sans index approché**.
- **Levé le 2026-11-01** : `vector` 0.8.7 installée en préproduction, par superutilisateur
  (`docs/infra/hebergement.md:91`).

**Reste à faire** : cadrage fonctionnel du chatbot ; déclaration de l'usage au socle IA (rôle,
budget) ; corpus vectorisé et index approché ; API (conversation, recherche sémantique) et surface
front ; clés fournisseur (aucune clé Voyage posée) et préalables contractuels/CDP du runbook ;
`CREATE EXTENSION vector` en production par superutilisateur.

**Décision attendue du porteur** : le périmètre du chatbot — (a) recherche de biens pour le
public, (b) assistant de la console agent, (c) autre — et le fournisseur/budget. Ce ticket bloque
de fait TCK-345.

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
avec la migration qui en a besoin — c'est-à-dire ici. — *Relevé 2026-11-16 : l'extension `vector`
et la table `embeddings` sont posées par TCK-2423 (migration `2026_10_31_242300`, ADR-0076 §11),
de façon facultative (la migration réussit sans l'extension).*

## Ce qu'il y a à faire

1. ~~`CREATE EXTENSION vector` dans une migration, avec son `down()`.~~ — caduc depuis TCK-2423.
2. Le schéma des embeddings : quoi vectoriser (biens ? documents ? conversations ?), quelle
   dimension, quel modèle — et **le modèle décide de la dimension**, donc en changer plus tard
   est une remigration. *(Relevé 2026-11-16 : le schéma est fixé par ADR-0076 §11 — colonne
   `dimension`, `vector` sans dimension fixe ; reste à choisir **quoi** vectoriser pour le chatbot
   et par quel maillon.)*
3. Le choix d'index : `hnsw` (rapide en lecture, coûteux à construire) contre `ivfflat`. *(Reste :
   TCK-2423 a délibérément laissé l'index au chatbot.)*
4. L'intégration Laravel AI SDK côté API, et la surface côté front.

## ⚠ Le risque à lever en premier

> **Levé le 2026-11-01 en préproduction** (`vector` 0.8.7, créée par superutilisateur —
> `vector.control` n'est pas `trusted`) ; reste à prévoir la même création en production (runbook
> « Allumer les embeddings du Radar »). Relevé 2026-11-16.

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
d'[ADR-0076](../../../adr/0076-le-socle-ia.md) (TCK-2383), qui choisit le modèle, tient le budget et
journalise. La table `embeddings` est dessinée par ADR-0076 § 11 ; ~~la crée **le premier de ses
usagers** à être implémenté, ce ticket ou TCK-2392 (lot 2 du Radar)~~ l'a créée TCK-2423 (relevé
2026-11-16).

## Références

- [ADR-0020](../../../adr/0020-postgresql-sur-tous-les-environnements.md) §2 — pourquoi l'image et pas le schéma
