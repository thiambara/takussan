---
id: TCK-015
title: Agence & équipe
status: todo
phase: P0
family: applicatif
estimate: M
created: 2026-04-15
updated: 2026-04-16
depends_on: [TCK-013, TCK-014]
blocks: [TCK-019, TCK-020]
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
  models:
    - docs/models-spec.md#2-agency
    - docs/models-spec.md#1-user
tags: [back, front, agency, team, admin]
---

## Contexte

La structure organisationnelle (agence, agents, rôles) est un prérequis pour la gestion de biens et les opérations métier. Le modèle `Agency` existe déjà mais les fonctionnalités de gestion d'équipe ne sont pas encore implémentées.

## Objectif

Implémenter la création et configuration d'agences, la gestion des agents et l'attribution de rôles aux membres.

## Delta à produire

### P0 — MVP bloquant

- [ ] Endpoint `POST /api/agencies` — créer une agence (nom, licence, contact, logo via medialibrary)
- [ ] Endpoint `PUT /api/agencies/{agency}` — configurer une agence
- [ ] Endpoint `POST /api/agencies/{agency}/members` — ajouter un agent
- [ ] Endpoint `DELETE /api/agencies/{agency}/members/{user}` — retirer un agent
- [ ] Endpoint `PUT /api/agencies/{agency}/members/{user}/role` — attribution de rôle
- [ ] Pages Next.js : création agence, liste membres, gestion rôles
- [ ] Tests : `AgencyCreationTest`, `AgencyMemberManagementTest`, `AgencyRoleAssignmentTest`

### P1

- [ ] Endpoint `GET /api/agencies/{agency}/stats` — statistiques globales (portefeuille, revenus)
- [ ] Endpoint `PUT /api/agencies/{agency}/settings` — paramètres de commission par défaut
- [ ] Page Next.js : dashboard agence avec statistiques
- [ ] Tests : `AgencyStatsTest`, `AgencyCommissionSettingsTest`

### P3

- [ ] Multi-branches / sous-agences (`parent_agency_id`)
- [ ] Gestion des congés / disponibilité des agents
- [ ] Plan d'abonnement et facturation SaaS
- [ ] Marketplace inter-agences

## Critères d'acceptation

- [ ] Un super_admin peut créer une agence avec logo uploadé
- [ ] Un agency_admin peut ajouter et retirer des agents de son agence
- [ ] Un agency_admin peut attribuer des rôles aux membres de son agence uniquement
- [ ] Les statistiques agence reflètent le portefeuille réel

## Hors périmètre

- Gestion des biens (→ TCK-019)
- Commissions automatiques par agent (→ TCK-005)

## Notes d'implémentation

_(à remplir par implementing-specs)_
