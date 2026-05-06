---
id: TCK-204
title: "Dashboard agent — corriger régressions i18n et formats"
status: todo
phase: P1
family: bug
estimate: M
created: 2026-05-06
updated: 2026-05-06
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
    - docs/features.md#13-réservations-courte-durée--visites
    - docs/features.md#14-location-longue-durée-baux
    - docs/features.md#18-maintenance--interventions
  models:
    - docs/models-spec.md#14-lease-
    - docs/models-spec.md#21-maintenancerequest-
tags: [front, bug, i18n, formatting, dashboard, agent-immobilier, smoke-test-2026-05-06]
---

## Objectif utilisateur

Un agent utilisant l'app en français voit des dates, montants, filtres, statuts et chaînes d'interface cohérents en français.

## Contrat de données

Aucun changement de modèle attendu. Les pages doivent passer par les helpers de format et la couche i18n pour rendre dates, devises, enums et libellés.

## Direction UX / Artistique

Cohérence FR stricte sur toutes les pages `/app/*` agent : mêmes formats, mêmes libellés, pas de valeur technique visible dans les contrôles.

## Contraintes strictes (métier)

- Toujours expliciter la locale pour dates/nombres.
- Les valeurs enum stockées ne changent pas.
- Les combobox ne doivent pas afficher `all` ou une clé technique.
- Les aria-labels visibles dans le snapshot doivent être localisés.

## Delta à produire

- [ ] Corriger les dates en anglais observées sur réservations, visites, baux, maintenance, documents et inventaires.
- [ ] Corriger les montants au format US sur réservations et baux.
- [ ] Corriger le shell authentifié agent : placeholder recherche et bouton langue en anglais.
- [ ] Corriger messagerie : `New group` et empty state anglais.
- [ ] Corriger maintenance : priorités `Low`, `High`, `Normal` et dates mixtes.
- [ ] Corriger baux : filtres affichant `all`.
- [ ] Ajouter tests/audit automatisé sur chaînes et formats critiques en locale FR.

## Critères d'acceptation

- [ ] Aucun mois anglais (`Jan`, `Feb`, `Mar`, `Apr`, `May`, `Jun`, etc.) n'apparaît dans les pages agent testées.
- [ ] Aucun montant XOF n'utilise une virgule comme séparateur de milliers.
- [ ] Le shell agent affiche la recherche et la langue en français.
- [ ] `/app/messages` n'affiche plus `New group` ni `Select a conversation to view messages.` en locale FR.
- [ ] `/app/maintenance` n'affiche plus `Low`, `High`, `Normal` sur les cards.
- [ ] `/app/leases` n'affiche plus `all` comme valeur de filtre.

## Hors périmètre

- Traduction complète Wolof.
- Conversion multi-devises.
- Refonte fonctionnelle des pages métier.

## Notes d'implémentation

_(à remplir par implementing-specs)_
