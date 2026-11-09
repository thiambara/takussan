---
id: TCK-2517
title: Recherche publique filtrée par agence et par agent, avec les comptes par option
status: todo
phase: P1
family: back
estimate: M
wave: 85
created: 2026-11-09
updated: 2026-11-09
depends_on: []
blocks: [TCK-2522, TCK-2523]
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
    - "docs/features.md#24-recherche--filtres"
  models: []
tags: [back, recherche, directory, audit-ux]
---

## Objectif utilisateur

Sur la fiche d'une agence de 67 biens, trouver « à louer, deux chambres, moins d'un million » en trois touchers, avec le nombre de biens que chaque option laisserait.

## Contrat de données

Relevé le 2026-11-09 : `GET /api/public/agencies/{slug}/properties` et `/agents/{slug}/properties` ne filtrent que par `contract_type` et trient au plus récent ; `GET /api/public/properties` n'a pas de filtre par agence ni par agent, alors que l'index Meilisearch déclare déjà `agency_id` et `user_id` filtrables (`config/scout.php`).

1. La liste publique (`SearchPublicPropertyRequest` → `PropertySearchService`) accepte **`filter[agency]=<slug>`** et **`filter[agent]=<slug>`** (slug public, TCK-2519 ; `username` en repli). Un slug inconnu, inactif ou non public rend une liste vide, jamais un 404 (aucune information sur l'existence d'un compte). Tous les autres filtres, le mot-clé et les tris de la liste s'y combinent.
2. **Même prédicat que le portefeuille** : sous l'un de ces deux filtres, la liste applique `publicPortfolio()` (public ET disponible) et non le seul `public()` — sinon le compte de la fiche et celui de la recherche divergent (doute relevé par la maquette). Un test épingle l'égalité des deux comptes.
3. **Comptes par option**, sur demande (`facets=contract_type,type,bedrooms,neighborhood`) : `meta.facets.<clé>` = liste `{ value, count }`, chaque compte calculé **sous tous les autres filtres posés, hors le sien** (la règle de TCK-2498 pour l'histogramme des prix). Plafonné aux quatre clés ci-dessus.
4. Les endpoints `…/{slug}/properties` existants restent (chargement « Voir plus » des pages actuelles) jusqu'à ce que TCK-2522 et TCK-2523 n'en aient plus besoin ; leur retrait est un ticket à part.

## Direction UX / Artistique

Sans objet (back). Maquettes servies : `/fr/playground/maquettes?p=agence&a=d`, `?p=agent&a=d` (écrans Filtres, Biens filtrés, Aucun bien).

## Contraintes strictes (métier)

- Rien d'un bien non public ne sort, ni dans la liste ni dans un compte.
- Le compte d'une facette sous un filtre incomplet est faux (piège déjà payé, `PropertySearchService` l. 455) : chaque facette se calcule sous le filtre complet moins la sienne.
- Sparse fieldsets inchangés.

## Delta à produire

- [ ] Règles `filter[agency]`, `filter[agent]`, `facets` dans `SearchPublicPropertyRequest`.
- [ ] Application dans `PropertySearchService` (filtre Meilisearch sur `agency_id` / `user_id`, prédicat du portefeuille).
- [ ] `meta.facets` (quatre clés).
- [ ] Tests.

## Critères d'acceptation

- [ ] AC1 — Pour une agence, `meta.total` de `filter[agency]=<slug>` égale le total de `GET /public/agencies/{slug}/properties` (même jeu de biens ; vérifié par ablation en remplaçant le prédicat par `public()` seul, avec un bien loué de l'agence).
- [ ] AC2 — `filter[agency]=a&filter[contract_type]=rent&facets=type` : les comptes par type somment au total de l'agence en location.
- [ ] AC3 — Le compte de `contract_type=sale` sous `filter[contract_type]=rent` est celui des biens à vendre de l'agence (la facette ignore son propre filtre).
- [ ] AC4 — Un slug inexistant rend `data: []`, `meta.total: 0`, statut 200.

## Hors périmètre

- Les fiches elles-mêmes (TCK-2522, TCK-2523).
- Le retrait des endpoints `…/{slug}/properties`.

## Notes d'implémentation

_(à remplir par implementing-specs)_
