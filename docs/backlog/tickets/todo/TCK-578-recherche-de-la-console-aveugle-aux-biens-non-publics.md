---
id: TCK-578
title: "La recherche de la console ne trouve ni un brouillon ni un bien privé : l'index Meilisearch ne contient que les biens publics"
status: todo
phase: P2
family: back
estimate: M
wave: 69
created: 2026-09-24
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#24-recherche--filtres
  models: []
tags: [back, recherche, meilisearch, console, adr-requise]
---

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : toujours vrai.** Aucun commit de code ne cite ce ticket ; TCK-662, TCK-591 et TCK-600
(done) le renvoient tous ici comme non traité. Aucun ADR ne tranche l'index de la console.

- `Property::shouldBeSearchable()` (`app/Models/Property.php:644-654`) n'indexe toujours que les
  biens publics — et exige en plus, depuis TCK-600/ADR-0048, une agence publique (`agencyIsPublic()`).
- `filter[search]` d'un modèle `Searchable` ne passe que par Meilisearch
  (`app/Models/Concerns/HasQueryBuilder.php:255-272`) ; la garde
  `scripts/check-filtering-single-mechanism.mjs` refuse un second chemin : la voie « repli SQL »
  devra l'amender.
- AC4 non tenu : `reference_number` est le **dernier** des `searchableAttributes`
  (`config/scout.php:184-186`), sans court-circuit SQL ni réglage de tolérance aux fautes.

**Reste à faire** : l'ADR, l'implémentation, le test d'isolation inter-agences et celui du filtre
public, la référence exacte en tête. Les chiffres 196 / 4 sont à re-mesurer à l'implémentation.

**Décision attendue du porteur** : quelle voie — (a) tout indexer + filtres, (b) deux index,
(c) repli SQL pour la console (précédent : la console plateforme de TCK-600) ? À trancher avec
TCK-2457 (prédicat d'indexation) et TCK-345 (moteur), qui recoupent.

## Objectif utilisateur

Un agent qui tape le titre ou la référence d'un bien de son agence dans la recherche de la console
le trouve, quel que soit son statut (brouillon, en attente de validation, refusé) ou sa visibilité.

## Contexte

Relevé par la vérification adverse de TCK-576 (bien 145, privé), **re-mesuré par la session le
2026-09-24** sur la pile locale, compte `agent1@dakarimmo.sn`, bien 623 de son agence
(`draft`, référence `PR-FC-FCBYZW`) :

| Requête | Total | Le bien 623 y est-il ? |
|---|---|---|
| `GET /api/properties?filter[search]=PR-FC-FCBYZW` | 196 | **non** |
| `GET /api/properties?filter[status]=draft` | 4 | oui |

La cause est un choix, pas un oubli : `Property::shouldBeSearchable()` n'indexe que les biens
publics hors `draft`, `pending_review` et `rejected`, **et dont l'agence est publique
(`agencyIsPublic()`, TCK-600/ADR-0048 — relevé 2026-11-16)** — l'index sert d'abord la recherche publique.
Or `filter[search]` de la console passe par le même index (`HasQueryBuilder`, TCK-281 —
`app/Models/Concerns/HasQueryBuilder.php`, l.230-272) : tout ce
qui n'y est pas est introuvable par la recherche, **en silence**. Les 196 réponses à une référence
exacte montrent l'autre face : la tolérance aux fautes, voulue pour le public, noie une recherche
par référence.

## Pourquoi ce n'est pas corrigé sur la branche qui l'a relevé

Deux voies, toutes deux **structurelles** — le `CLAUDE.md` racine exige un ADR avant :

1. **Tout indexer**, avec `visibility`, `status` et `agency_id` en attributs filtrables, et
   restreindre la recherche publique par filtre Meilisearch. Change ce que contient l'index public :
   une erreur de filtre y expose un brouillon.
2. **Deux index** (public, et console par agence), ou un repli SQL pour la console. Coût
   d'indexation doublé, ou perte de la tolérance aux fautes côté console.

## Critères d'acceptation

- [ ] Un ADR tranche entre les voies ci-dessus (ou une autre), avec la mesure du risque
      d'exposition d'un bien non public sur la recherche publique.
- [ ] Un agent trouve un brouillon, un bien en attente, refusé ou privé de son agence par son titre
      et par sa référence exacte ; jamais un bien d'une autre agence.
- [ ] La recherche publique ne rend aucun bien non public — gardé par un test qui rougit si le
      filtre de visibilité disparaît.
- [ ] Une référence exacte vient en tête des résultats.

## Hors périmètre

- Les consoles super-admin, qui ont leur propre `LIKE` SQL (TCK-281). La console plateforme
  (TCK-600) cherche déjà « par la base, jamais l'index public » : la voie « repli SQL pour la
  console » a donc un précédent dans le dépôt (relevé 2026-11-16).
