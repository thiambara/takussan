---
id: TCK-111
title: Fix runtime error — fetchDashboardProperties appelée côté serveur
status: todo
phase: P0
family: bug
estimate: S
created: 2026-04-29
updated: 2026-04-29
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
tags: [front, bug, p0, server-client]
---

## Objectif utilisateur

L'agent / propriétaire peut accéder à `/app/properties` sans erreur de rendu.

## Contrat de données

Consomme l'endpoint de liste des biens (déjà implémenté côté backend). Aucun changement d'API nécessaire.

## Direction UX / Artistique

Page identique à l'état prévu — aucun changement visuel, correction uniquement technique.

## Contraintes strictes (métier)

La page doit se charger pour tous les rôles qui ont accès aux biens (agent, owner, agency_admin, super_admin).

## Delta à produire

- [ ] Identifier dans `src/app/(dashboard)/app/properties/page.tsx:54` l'appel à `fetchDashboardProperties()` depuis le Server Component
- [ ] Déplacer l'appel vers un composant Client (wrapper `"use client"`) ou refactoriser `fetchDashboardProperties` pour qu'elle soit server-safe (fetch direct sans hook React)
- [ ] Vérifier que la page charge sans erreur en local pour les rôles agent et super_admin

## Critères d'acceptation

- [ ] `/app/properties` ne renvoie plus d'erreur runtime "Attempted to call … from the server"
- [ ] La liste des biens s'affiche correctement pour un agent connecté
- [ ] Aucune régression sur les autres pages du dashboard

## Hors périmètre

- Refactoring général des autres Server/Client boundaries — corriger uniquement la page `/app/properties`
- Pagination, filtres ou tri de la liste

## Notes d'implémentation

_(à remplir par implementing-specs)_
