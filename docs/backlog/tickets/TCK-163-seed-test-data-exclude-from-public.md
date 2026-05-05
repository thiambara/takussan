---
id: TCK-163
title: "Données seed — exclure les biens de test du flux public"
status: todo
phase: P2
family: technique
estimate: S
created: 2026-05-05
updated: 2026-05-05
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#11-gestion-des-biens
tags: [back, bug, p2, smoke-test-2026-05-05, seeders, data-quality, visiteur-anonyme]
---

## Objectif utilisateur

Un visiteur anonyme qui ouvre la home ou `/properties` ne voit aucun bien factice de test (placeholders `Property Test Filter - <id>` ou `Propriété Premium Featured` dupliqués à 999 999 999 F CFA). Les fixtures de dev existent toujours pour les tests locaux mais sont invisibles dans le flux public.

## Contrat de données

- Champ déjà existant (`is_test`/`is_demo`) à privilégier ; sinon ajouter une colonne booléenne `is_test` sur `properties` (migration).
- L'API publique (`/api/public/properties*` et `/api/public/properties/search`) doit filtrer `is_test = false` par défaut.
- Le dashboard authentifié reste libre de les afficher (pas de filtre par défaut côté `/api/properties`).

## Direction UX / Artistique

_(N/A — ticket back/données)_

## Contraintes strictes (métier)

- Pas de suppression destructive en base : on flag, on ne purge pas.
- Le seeder doit pouvoir générer des fixtures de test marquées `is_test = true` pour les tests automatisés.
- Les 17+ biens `Property Test Filter - <random>` actuellement en base sont à backfiller avec `is_test = true`.
- Les 3 biens `Propriété Premium Featured` à 999 999 999 F CFA, identiques (Almadies, 100 m², 2 ch, photo placeholder) : également flagger en `is_test` ou les remplacer par 3 biens distincts crédibles dans le seeder.

## Delta à produire

- [ ] Migration `add_is_test_to_properties` (ou réutiliser un flag existant à confirmer).
- [ ] Mettre à jour le `PropertySeeder` (ou seeder dédié) pour :
  - marquer les fixtures `Property Test Filter - <id>` comme `is_test = true` ;
  - soit supprimer les 3 doublons `Propriété Premium Featured` à 999 999 999 F CFA, soit les flagger + remplacer par 3 biens featured distincts crédibles.
- [ ] Ajouter un filtre par défaut `is_test = false` sur les controllers publics (`PublicPropertyController`, `PublicPropertySearchController` ou équivalents).
- [ ] Backfill : commande artisan `properties:flag-test` qui marque par pattern de nom `Property Test Filter -*`.
- [ ] Tests : `PublicPropertySearchTest` vérifie qu'un bien `is_test = true` n'apparaît pas dans la liste publique.

## Critères d'acceptation

- [ ] `GET /api/public/properties` ne renvoie aucun bien `Property Test Filter -*`.
- [ ] La home publique (`/`) n'affiche plus 3 cartes "Propriété Premium Featured" identiques à 999 999 999 F CFA.
- [ ] Les fixtures de test restent disponibles via le seeder pour les tests auto et le développement local.
- [ ] Le dashboard authentifié continue d'afficher tous les biens (filtre opt-in seulement).

## Hors périmètre

- Refonte du seeder principal.
- Modération éditoriale des biens non-test (relève d'un autre flux).
- Suppression définitive des biens en base.

## Notes d'implémentation

_(à remplir par implementing-specs)_
