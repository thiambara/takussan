---
id: TCK-345
title: "Recherche PostgreSQL (pg_trgm / FTS) : faut-il retirer Meilisearch ?"
status: todo
phase: P3
family: technique
estimate: XL
wave: 44
created: 2026-08-21
updated: 2026-11-16
depends_on: [TCK-344]
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
tags: [back, postgresql, recherche, adr]
---

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : bloqué externe** — décision d'architecture du porteur, et dépendance TCK-344 (chatbot)
non faite. La prémisse factuelle tient : ADR-0008 est toujours accepté, les mêmes 7 modèles sont
`Searchable`, `phpunit.xml:76` force `SCOUT_DRIVER=meilisearch`. Aucun commit ne cite ce ticket.

- **Fermé entre-temps, en faveur de la mesure** : `pg_trgm` est installée (TCK-2392, migration
  `2026_10_30_392200`, présente en préproduction) et `vector` + table `embeddings` aussi
  (TCK-2423, ADR-0076 §11). L'argument hybride existe donc sans le chatbot.
- L'appareil à démonter s'est alourdi (inventaire mis à jour ci-dessous).

**Reste à faire** : banc de mesure (requêtes réelles — le journal anonyme des recherches d'ADR-0088
en fournit —, deux moteurs, pertinence et tolérance aux fautes), puis un ADR qui remplace ou
confirme ADR-0008, puis seulement le démontage ou la fermeture.

**Décision attendue du porteur** : (a) garder `depends_on: [TCK-344]` et attendre le chatbot,
(b) lever la dépendance et lancer la mesure maintenant, (c) fermer le ticket en « on garde
Meilisearch » ? À trancher avec TCK-578.

## Contexte

⚠ **Ce ticket RÉVOQUERAIT [ADR-0008](../../../adr/0008-meilisearch-sur-tous-les-environnements.md).**
Il ne s'implémente pas sans un ADR qui le remplace.

Ce qu'il faudrait démonter, mesuré le 2026-08-21 : **7 modèles indexés** (`Property`, `Document`,
`Message`, `Customer`, `MaintenanceRequest`, `Agency`, `User`), le driver forcé **sans repli** dans
`phpunit.xml`, un conteneur de service en CI, et tout l'appareil d'isolation d'index par processus
(`TestSearchIndex`, `MeilisearchBarrier`, dette D-44) — plus TCK-334 ~~, encore ouverte~~ (done,
relevé 2026-11-16).

S'y ajoutent depuis (relevé 2026-11-16) : l'index de **suggestions**
(`app/Services/Search/Suggestions/SuggestionIndex*`, ADR-0088), le coffre de documents
(`app/Services/Documents/RechercheDuCoffre.php`, `rawSearch`), `RepartitionDesPrix` (multi-search)
et la tuile Santé `search`.

## L'argument POUR, et il n'est devenu bon que récemment

Il n'existait pas au moment de la migration : **c'est TCK-344 qui le crée**. — *Relevé
2026-11-16 : l'argument a pris corps avec TCK-2392 (`pg_trgm` installée, signal de similarité du
Radar) et TCK-2423 (`vector` + table `embeddings`, ADR-0076 §11) ; le chatbot de TCK-344 reste à
faire.* pgvector et `pg_trgm`
dans la même base, c'est de la **recherche hybride** — sémantique et lexicale, jointes à la donnée
métier — sans second système à exploiter, à sauvegarder, à surveiller et à isoler en test.

Tant que le chatbot n'existe pas, cet argument est théorique. C'est pourquoi ce ticket dépend de
TCK-344 et non de la migration. *(Dépendance discutable depuis TCK-2392/TCK-2423 — à revoir par
le porteur, cf. re-vérification.)*

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

- [ADR-0008](../../../adr/0008-meilisearch-sur-tous-les-environnements.md) — la décision à révoquer
- [ADR-0020](../../../adr/0020-postgresql-sur-tous-les-environnements.md) — pourquoi ce chantier a été reporté
