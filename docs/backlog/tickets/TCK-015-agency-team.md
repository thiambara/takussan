---
id: TCK-015
title: Agence & équipe
status: review
phase: P0
family: applicatif
estimate: M
created: 2026-04-15
updated: 2026-04-22
depends_on: [TCK-013, TCK-014, TCK-049]
blocks: [TCK-034, TCK-020]
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

- Gestion des biens (→ TCK-034)
- Commissions automatiques par agent (→ P3 futur)

## Notes d'implémentation

**Vague 2 — groupe B-IDENTITY (backend, 2026-04-22)** — livre la partie API du P0 manquant et du P1 stats :

- `AgencyMemberRoleController::update` (PUT `/api/agencies/{agency}/members/{user}/role`) : controller dédié, scope agence, refuse un user hors agence (422), bloque l'attribution de `super_admin` hors super_admin (403), utilise `syncRoles` (remplace les rôles précédents) et `findOrCreate($name, 'web')` pour éviter la fragmentation par guard.
- Alias routes `/api/agencies/{agency}/members` (POST/DELETE) sur `AgencyController@addAgent/removeAgent` — la voie canonique TCK-015 sans casser les appels existants sous `/agents`.
- `AgencyStatsController::show` (GET `/api/agencies/{agency}/stats`) : `properties_count`, `members_count`, `customers_count`, `active_leases_count`, `commission_month` (somme des `commission_amount` sur les leases signés dans le mois courant, fallback `created_at` si `signed_at` est null). Aucune mise en cache (MVP).
- Tests feature : `AgencyRoleAssignmentTest` (10 cas) + `AgencyStatsTest` (5 cas). Totalité de la suite verte (660 passed).

Pages Next.js et tests frontend restent à livrer par un autre groupe.
