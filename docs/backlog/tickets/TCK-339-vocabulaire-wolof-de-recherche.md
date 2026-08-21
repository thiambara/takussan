---
id: TCK-339
title: "Vocabulaire wolof de recherche — revue lexicale requise"
status: todo
phase: P3
family: applicatif
estimate: M
wave: 42
created: 2026-08-21
updated: 2026-08-21
depends_on: [TCK-335]
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#28-internationalisation--préférences
  models:
    - docs/models-spec.md#3-property
tags: [back, search, i18n, wolof]
---

## Objectif utilisateur

Un visiteur qui cherche en wolof trouve quelque chose.

## Contrat de données

Sorti de [TCK-335](TCK-335-recherche-navigation-defauts-mesures.md), et **sa prémisse d'origine
était fausse** : `lang/wo/properties.php` existe et porte les 35 clés. Ce n'est pas la traduction
qui manque, c'est qu'on **ne peut pas la réutiliser comme vocabulaire de recherche**.

## Contraintes strictes (métier)

- **Injecter les libellés d'affichage wolof produirait un index FAUX**, et c'est vérifié mot par
  mot : `land => 'Dëkk'` (village), `farm => 'Jën'` (poisson), `sale => 'Jënd'` (**acheter**),
  `rent => 'Tëddé'` (se coucher). On rendrait des terrains sur « village » et des biens **en vente**
  sur un mot signifiant *acheter*. Seul `house => kër` est mesurablement bon. **Une erreur de ce
  type est invisible à toute revue non wolophone.**
- **Une table d'alias de recherche est INDÉPENDANTE des libellés d'affichage.** Les deux n'ont ni
  le même objet ni la même contrainte.
- **Dériver les alias de `lang/` casserait le déclencheur de réindexation** : `scripts/deploy.sh`
  réimporte sur un diff de `config/scout.php` ou de `app/Models/*.php`, **jamais** sur un diff de
  `lang/`. L'index resterait sur l'ancien vocabulaire et **rien ne rougirait**.

## Delta à produire

- [ ] **Revue lexicale par un locuteur** avant toute ligne de code
- [ ] Table d'alias de recherche wolof, dans `Property` ou `config/scout.php` — jamais dans `lang/`

## Critères d'acceptation

- [ ] AC1 — un jeu de requêtes wolof validé par un locuteur rend des résultats pertinents
- [ ] AC2 — aucun alias ne fait remonter un bien en vente sur un mot signifiant « acheter »

## Hors périmètre

- Les libellés d'affichage wolof, qui sont complets et corrects.

## Notes d'implémentation

_(à remplir par implementing-specs)_
