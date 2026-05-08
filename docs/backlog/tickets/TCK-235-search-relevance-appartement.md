---
id: TCK-235
title: "Recherche — améliorer la pertinence plein texte"
status: todo
phase: P0
family: bug
estimate: M
created: 2026-05-08
updated: 2026-05-08
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#24-recherche--filtres
  models:
    - docs/models-spec.md#3-property
tags: [back, front, search, scout, smoke-test-2026-05-08]
---

## Objectif utilisateur

Un utilisateur qui recherche un type de bien doit voir les résultats les plus pertinents en tête.

## Contrat de données

Finding smoke `docs/smoke-tests/utilisateurs-authentifies-2026-05-08.md` : `TC-SEARCH-01` conserve le paramètre `search=appartement`, mais les premiers résultats ne correspondent pas clairement à la requête.

## Direction UX / Artistique

Conserver l'UI de liste actuelle ; rendre l'ordre des résultats crédible et explicable sans ajouter de bruit visuel.

## Contraintes strictes (métier)

- La recherche doit rester compatible avec les filtres et la pagination existants.
- Le frontend doit utiliser les paramètres Spatie attendus et ne pas filtrer côté client.
- Les champs internes ou sensibles ne doivent pas être indexés ni exposés.

## Delta à produire

- [ ] Diagnostiquer le mapping entre query frontend `search` et filtre API plein texte.
- [ ] Ajuster la pondération ou le fallback de recherche pour favoriser type/titre/adresse pertinents.
- [ ] Ajouter un test backend de pertinence minimal sur une requête de type de bien.
- [ ] Vérifier que pagination et tri restent compatibles avec la recherche.

## Critères d'acceptation

- [ ] `/properties?search=appartement` retourne des appartements avant les types clairement non correspondants quand des appartements existent.
- [ ] La page 2 conserve le terme de recherche.
- [ ] Combiner recherche et filtres ne récupère pas tous les biens côté client.
- [ ] Un test automatisé fige la pertinence minimale attendue.

## Hors périmètre

- Recherche sémantique par embeddings.
- Autocomplétion.
- Refonte des cards résultats.

## Notes d'implémentation

_(à remplir par implementing-specs)_
