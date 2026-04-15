---
id: TCK-014
title: Rôles & permissions
status: todo
phase: P0
family: applicatif
estimate: M
created: 2026-04-15
updated: 2026-04-16
depends_on: [TCK-013]
blocks: [TCK-015, TCK-019, TCK-020, TCK-023]
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
  models:
    - docs/models-spec.md#1-user
    - docs/models-spec.md#spatielaravel-permission
tags: [back, auth, spatie, permissions, roles]
---

## Contexte

Le système de rôles et permissions est le socle d'autorisation de toute la plateforme. Spatie/laravel-permission est déjà référencé dans `models-spec.md` avec le mode `teams = true` scopé par `agency_id`.

## Objectif

Mettre en place le système de rôles prédéfinis, permissions granulaires par ressource, et la distinction « mes ressources » vs « toutes les ressources ».

## Delta à produire

### P0 — MVP bloquant

- [ ] Seeder `RolesAndPermissionsSeeder` : rôles prédéfinis (customer, agent, agency_admin, owner, service_provider, super_admin)
- [ ] Permissions par ressource (view, create, update, delete, update_all, delete_all) pour chaque entité
- [ ] Middleware et policies distinguant « mes ressources » vs « toutes les ressources »
- [ ] Tests : `RolesSeederTest`, `PermissionPolicyTest`

### P1

- [ ] Endpoint `POST /api/users/{user}/roles` — attribution et retrait de rôles
- [ ] Éditeur de rôles personnalisés scopé par agence (`agency_id` via teams spatie)
- [ ] Page Next.js : gestion des rôles (attribution, retrait) dans le dashboard admin
- [ ] Tests : `RoleAssignmentTest`, `CustomRoleTest`

### P2

- [ ] Délégation temporaire de permissions (date début/fin)

### P3

- [ ] Règles conditionnelles / policies dynamiques

## Critères d'acceptation

- [ ] Les 6 rôles prédéfinis sont créés par le seeder
- [ ] Un agent ne peut modifier que ses propres biens sauf s'il a `properties.update_all`
- [ ] Les rôles personnalisés créés par une agence ne sont pas visibles par une autre
- [ ] L'attribution de rôle est réservée aux `agency_admin` et `super_admin`
- [ ] Le retrait du rôle `agent` d'un utilisateur ne supprime pas ses biens/réservations — ses ressources restent assignées à l'agence (l'utilisateur perd l'accès, pas les données)

## Hors périmètre

- Gestion des utilisateurs (activation/blocage) (→ TCK-023)
- Interface de gestion des rôles côté super-admin (→ TCK-023)

## Notes d'implémentation

_(à remplir par implementing-specs)_
