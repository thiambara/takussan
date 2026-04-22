---
id: TCK-023
title: Administration & configuration
status: done
phase: P0
family: applicatif
estimate: M
created: 2026-04-15
updated: 2026-04-22
depends_on: [TCK-013, TCK-014, TCK-049]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#10-tag
    - docs/models-spec.md#30-setting-
    - docs/models-spec.md#31-integration-
    - docs/models-spec.md#1-user
tags: [back, front, admin, settings, tags, users]
---

## Contexte

L'administration de la plateforme nécessite des outils pour gérer les tags/amenités, les utilisateurs et les enums métier. Les modèles `Setting` et `Integration` sont nouveaux dans `models-spec.md`.

## Objectif

Implémenter les outils d'administration : gestion des tags, gestion des utilisateurs (activation/blocage), enums métier et configuration plateforme.

## Delta à produire

### P0 — MVP bloquant

- [ ] Endpoints CRUD Tags : `GET/POST /api/admin/tags`, `PUT/DELETE /api/admin/tags/{tag}` — avec type (amenity, feature, label, crm)
- [ ] Seeder `TagSeeder` : tags par défaut (amenités courantes : piscine, climatisation, meublé, etc.)
- [ ] Endpoint `GET /api/admin/users` — liste des utilisateurs avec filtres (status, role, agency)
- [ ] Endpoint `PUT /api/admin/users/{user}/status` — activation / blocage d'un utilisateur
- [ ] Pages Next.js : admin tags, admin utilisateurs
- [ ] Tests : `AdminTagCrudTest`, `AdminUserManagementTest`

### P1

- [ ] Endpoint `GET/PUT /api/admin/enums` — gestion des enums métier (types de biens, statuts) — lecture + mise à jour dynamique
- [ ] Endpoint `GET/PUT /api/admin/email-config` — configuration email (templates, expéditeur)
- [ ] Migration + CRUD `Setting` : `GET/PUT /api/admin/settings` — paramètres globaux de plateforme (`scope` : global, agency)
- [ ] Migration + CRUD `Integration` : `GET/POST/PUT/DELETE /api/admin/integrations` — gestion des intégrations tierces (API keys chiffrées)
- [ ] Tests : `AdminEnumManagementTest`, `AdminEmailConfigTest`, `AdminSettingTest`, `AdminIntegrationTest`

> **Pourquoi Setting/Integration en P1 ?** `Setting` est consommé dès P1 par les politiques de remboursement et l'auto-traduction (P3). `Integration` est nécessaire pour la passerelle paiement et la recherche vocale (P3).

### P3

- [ ] Mode maintenance programmé
- [ ] Feature flags

## Critères d'acceptation

- [ ] Un super_admin peut créer, modifier et supprimer des tags par type
- [ ] Un super_admin peut bloquer un utilisateur (son statut passe à `blocked`)
- [ ] Les tags seedés sont présents après `migrate:fresh --seed`
- [ ] La gestion des enums est dynamique et ne nécessite pas de migration

## Hors périmètre

- Rôles et permissions (→ TCK-014)
- Gestion d'agence (→ TCK-015)

## Notes d'implémentation

_(à remplir par implementing-specs)_
