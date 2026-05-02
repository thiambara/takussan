---
id: TCK-135
title: "/admin/roles — Éditeur de rôles & permissions personnalisés"
status: todo
phase: P1
family: front
estimate: M
created: 2026-05-02
updated: 2026-05-02
depends_on: [TCK-014]
blocks: []
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#1-user
tags: [front, admin, roles, permissions, p1]
---

## Objectif utilisateur

Un agency_admin (ou super_admin) accède à `/admin/roles` pour consulter les rôles disponibles et créer/éditer des rôles personnalisés à l'agence (basés sur `spatie/laravel-permission` avec teams), sans page « En cours de développement ».

## Contrat de données

Endpoints livrés par TCK-014 (rôles & permissions) — `spatie/laravel-permission` avec teams scopées par `agency_id` :
- `GET /api/roles?filter[agency_id]=...` (rôles prédéfinis + custom de l'agence)
- `GET /api/permissions` (catalogue des permissions disponibles)
- `POST /api/roles` / `PATCH /api/roles/{id}` / `DELETE /api/roles/{id}` (custom uniquement)
- `POST /api/roles/{id}/permissions` / `DELETE /api/roles/{id}/permissions/{permission}`

Conventions Spatie côté frontend : `fields[roles]=`, `include=permissions`, `filter[scope]=agency|global`.

## Direction UX / Artistique

- Vue **deux colonnes** : à gauche la liste des rôles (prédéfinis + custom), à droite l'éditeur du rôle sélectionné.
- L'éditeur expose les permissions groupées par ressource (Property, Booking, Lease, ...) avec checkboxes et distinction « mes ressources » vs « toutes les ressources ».
- Les rôles prédéfinis (customer, agent, agency_admin, owner, service_provider, super_admin) sont **lecture seule** — affichés mais non éditables.
- Bouton "Nouveau rôle personnalisé" avec dialog de création (nom + permissions de base).
- État de comparaison : montrer ce qui change avant validation.
- Aucun StubPlaceholder.

## Contraintes strictes (métier)

- Page accessible uniquement aux rôles disposant de la permission `roles.manage_in_agency` (agency_admin) ou `roles.manage_all` (super_admin) — voir TCK-014.
- Un agency_admin ne peut créer/éditer que des rôles **scopés à son agence** (teams Spatie).
- Les rôles prédéfinis ne sont jamais modifiables ni supprimables (seul le super_admin pourrait, et c'est explicitement hors périmètre ici).
- Suppression d'un rôle custom interdite s'il est encore attribué à un utilisateur (le backend renvoie l'erreur, le frontend l'affiche clairement).
- Toute mutation déclenche un `ActivityLog` côté backend.

## Delta à produire

- [ ] Page UI: `src/app/(dashboard)/admin/roles/page.tsx` — retirer `<StubPlaceholder>`
- [ ] Composants `RolesList`, `RoleEditor`, `PermissionMatrix`, `CreateRoleDialog`
- [ ] Hooks React Query : liste rôles, mutations CRUD, mutations permissions
- [ ] Garde permission frontend (état dégradé si non autorisé)
- [ ] Confirmation explicite à la suppression d'un rôle (avec alerte si attribué)
- [ ] Skeletons et états vides
- [ ] Tests UI : guard, scope agence, lecture seule des rôles prédéfinis

## Critères d'acceptation

- [ ] La page n'affiche plus `<StubPlaceholder>`
- [ ] La liste affiche les rôles prédéfinis et les rôles custom de l'agence
- [ ] Sélectionner un rôle prédéfini ouvre l'éditeur en lecture seule
- [ ] Sélectionner un rôle custom permet de cocher/décocher les permissions et de sauvegarder
- [ ] Créer un rôle custom est possible via un dialog dédié
- [ ] Supprimer un rôle attribué affiche une erreur explicite
- [ ] Un agency_admin ne voit/ne touche pas aux rôles d'une autre agence
- [ ] Aucun fetch ne retourne tous les champs (sparse fieldsets)

## Hors périmètre

- Délégation temporaire de permissions (TCK-108)
- Règles conditionnelles / policies dynamiques (P3)
- Édition des rôles prédéfinis (jamais modifiables)
- Modification des rôles d'un utilisateur (TCK-133)

## Notes d'implémentation

_(à remplir par implementing-specs)_
