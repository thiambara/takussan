---
id: TCK-196
title: "CRM agent — restaurer les fiches client détail"
status: todo
phase: P0
family: bug
estimate: S
created: 2026-05-06
updated: 2026-05-06
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#16-crm--relation-client
  models:
    - docs/models-spec.md#7-customer
    - docs/models-spec.md#33-customernote-
tags: [front, back, bug, crm, agent-immobilier, smoke-test-2026-05-06]
---

## Objectif utilisateur

Un agent ouvre une fiche client depuis `/app/customers` et accède au détail CRM sans 404.

## Contrat de données

La liste `/app/customers` expose des liens vers `/app/customers/{id}` pour des Customers de l'agence active. Le détail doit charger le Customer, ses relations utiles et rester scoped agence/profil actif.

## Direction UX / Artistique

Page détail dense et opérationnelle : identité du contact, coordonnées, pipeline, notes, documents, tags et actions de suivi visibles sans détour. En cas d'accès interdit ou d'objet absent, afficher un état d'erreur métier, pas la page 404 générique Next.

## Contraintes strictes (métier)

- Un agent ne voit jamais une fiche client hors agence active.
- La page détail doit conserver les sparse fieldsets et `include=` prévus par les conventions API.
- Un 404 ne doit être rendu que si le Customer est réellement introuvable ou hors scope.

## Delta à produire

- [ ] Diagnostiquer pourquoi `/app/customers/{id}` retourne 404 pour des ids présents dans `/app/customers`.
- [ ] Restaurer le chargement de la page détail client avec les relations nécessaires.
- [ ] Harmoniser le comportement 403/404 entre frontend et API pour les clients hors scope.
- [ ] Ajouter un test de navigation depuis la liste vers une fiche client existante.
- [ ] Ajouter un test d'accès refusé pour un agent d'une autre agence.

## Critères d'acceptation

- [ ] Depuis `/app/customers`, cliquer un client ouvre une fiche détail exploitable.
- [ ] `/app/customers/424` ou un client seed équivalent ne rend plus la 404 générique si le client appartient à l'agence.
- [ ] Les notes, documents et tags affichent un état chargé ou vide cohérent.
- [ ] Les requêtes respectent `fields[...]` et `include=`.

## Hors périmètre

- Refonte complète de l'UX CRM.
- Création de nouvelles relations métier non prévues par les specs.
- Campagnes email/SMS.

## Notes d'implémentation

_(à remplir par implementing-specs)_
