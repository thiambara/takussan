---
id: TCK-198
title: "Mes biens agent — compléter filtres, colonnes et actions en lot"
status: done
phase: P1
family: front
estimate: M
wave: 22
created: 2026-05-06
updated: 2026-05-06
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#24-recherche--filtres
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#8-propertycollaborator
tags: [front, properties, filters, bulk-actions, agent-immobilier, smoke-test-2026-05-06]
---

## Objectif utilisateur

Un agent filtre, compare et administre rapidement un grand portefeuille depuis `/app/properties`.

## Contrat de données

La liste des biens doit consommer les filtres et tris serveur disponibles, avec fieldsets limités aux colonnes nécessaires. Les données de collaborateur/agent assigné doivent être incluses lorsque l'affichage le requiert.

## Direction UX / Artistique

Interface de portefeuille dense et scannable : filtres en tête, colonnes métier essentielles, sélection multiple et barre d'actions contextualisée.

## Contraintes strictes (métier)

- Aucun filtrage client sur une liste complète.
- Les actions en lot doivent respecter les permissions par bien.
- Les biens dont l'agent est collaborateur doivent rester distinguables des biens dont il est responsable principal.

## Delta à produire

- [ ] Ajouter les colonnes attendues : agent assigné/collaborateur, date, vues, favoris, référence, statut et visibilité.
- [ ] Ajouter les filtres manquants : ville, agent assigné, plage prix, plage dates, uniquement les miens.
- [ ] Ajouter sélection multiple et actions en lot pour archiver, dépublier et changer l'agent assigné si autorisé.
- [ ] Brancher tous les contrôles sur les query params API, pas sur un filtrage local.
- [ ] Ajouter tests de rendu liste, filtres URL/API et barre d'actions en lot.

## Critères d'acceptation

- [ ] `/app/properties` couvre les critères de `TC-AGT-03`.
- [ ] Une recherche filtrée ne récupère pas tous les champs ni tous les biens.
- [ ] Sélectionner plusieurs lignes affiche les actions en lot autorisées.
- [ ] Les compteurs pagination restent cohérents après filtres.

## Hors périmètre

- Refonte visuelle complète de la page.
- Import/export du portefeuille.
- Changement des règles RBAC backend.

## Notes d'implémentation

Les filtres ajoutés restent côté API via Spatie; la barre d'actions en lot boucle sur les transitions autorisées par bien pour conserver les contrôles existants.
