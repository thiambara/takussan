---
id: TCK-133
title: "/admin/users — Gestion des utilisateurs (activation, blocage, rôles)"
status: todo
phase: P1
family: front
estimate: M
created: 2026-05-02
updated: 2026-05-02
depends_on: [TCK-014, TCK-023]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
    - docs/features.md#22-rôles--permissions
  models:
    - docs/models-spec.md#1-user
    - docs/models-spec.md#2-agency
tags: [front, admin, users, p1]
---

## Objectif utilisateur

Un agency_admin / super_admin accède à `/admin/users` pour consulter, activer, bloquer ou modifier les rôles des comptes utilisateurs de son périmètre, sans page « En cours de développement ».

## Contrat de données

Endpoints existants côté backend (TCK-014, TCK-023) :
- `GET /api/users` — scope automatique selon le rôle (agency_admin → users de son agence, super_admin → tous)
- `PATCH /api/users/{id}` — édition statut / rôle / champs admin
- `POST /api/users/{id}/roles` / `DELETE /api/users/{id}/roles/{role}` — attribution / retrait de rôle

Conventions Spatie : `filter[search]`, `filter[status]`, `filter[role]`, `filter[type]`, `include=agency,roles`, `fields[users]=id,first_name,last_name,email,status,type,...`.

⚠ **Distinction explicite avec `/admin/team` (TCK-065)** : `/admin/team` gère la composition de l'équipe agence (ajout/retrait d'un agent à une agence). `/admin/users` est une vue **liste exhaustive** des comptes (avec recherche, blocage, statut), incluant les locataires/bailleurs/clients hors équipe.

## Direction UX / Artistique

- Vue **table dense** : colonnes (avatar, nom, email, rôle(s), statut, agence, dernière connexion).
- Filtres : recherche libre (nom/email), statut (active/blocked/pending), rôle, agence (super_admin only).
- Action par ligne : voir détail, activer/bloquer, gérer rôles, envoyer reset mdp.
- Drawer latéral pour le détail / édition d'un user (ne pas naviguer hors page).
- Cohérent avec `/admin/team` mais **clairement différent** (libellé h1 "Gestion des utilisateurs", sous-titre "Comptes de la plateforme").

## Contraintes strictes (métier)

- Un agency_admin ne voit et ne modifie **que** les users de son agence ; le scope est imposé par le backend, le frontend ne doit pas court-circuiter.
- Bloquer un user déclenche une révocation immédiate des tokens Sanctum (côté backend) et un `ActivityLog`.
- Le super_admin ne peut pas se bloquer lui-même.
- Modifier les rôles passe obligatoirement par les endpoints `roles` (jamais `PATCH /users` direct sur un champ rôle).
- Permission requise : `users.update_all` (super_admin) ou `users.update_in_agency` (agency_admin) — voir TCK-014.

## Delta à produire

- [ ] Page UI: `src/app/(dashboard)/admin/users/page.tsx` — retirer `<StubPlaceholder>`
- [ ] Composants `AdminUsersTable`, `AdminUsersFilters`, `UserDetailDrawer`, `UserRolesEditor`
- [ ] Hooks React Query : liste, mutation statut, mutation rôles
- [ ] Garde permission côté frontend (afficher état dégradé si non autorisé)
- [ ] Skeletons et états vides
- [ ] Tests UI : guard rôle, scope agence, mutations

## Critères d'acceptation

- [ ] La page n'affiche plus `<StubPlaceholder>`
- [ ] Un agency_admin ne voit que les users de son agence
- [ ] Un super_admin voit tous les users avec filtre agence
- [ ] Activer/bloquer un user met à jour la liste sans rechargement complet
- [ ] Modifier les rôles d'un user ouvre un éditeur dédié et persiste via les endpoints `roles`
- [ ] Le super_admin connecté ne peut pas se bloquer lui-même (action désactivée)
- [ ] Aucun fetch ne retourne tous les champs (sparse fieldsets)

## Hors périmètre

- Création de user (couverte par invitation TCK-065 et par l'inscription publique)
- Vue/édition du profil détaillé (TCK-069 et tickets profil dédiés)
- Suppression de compte (RGPD, P2 dédié)
- Modification des rôles personnalisés agence (TCK-135)

## Notes d'implémentation

_(à remplir par implementing-specs)_
