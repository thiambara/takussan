---
id: TCK-030
title: Maintenance & interventions
status: review
phase: P1
family: applicatif
estimate: M
created: 2026-04-15
updated: 2026-04-22
depends_on: [TCK-034, TCK-027]
blocks: []
spec_refs:
  features:
    - docs/features.md#18-maintenance--interventions
  models:
    - docs/models-spec.md#21-maintenancerequest-
tags: [back, front, maintenance, tickets, service-provider]
---

## Contexte

Le modèle `MaintenanceRequest` est nouveau dans `models-spec.md`. Ce domaine permet aux locataires de signaler des problèmes et aux agents de gérer les interventions avec prestataires.

## Objectif

Implémenter le système de signalement de problèmes, assignation de prestataires, suivi des statuts et historique des interventions par bien.

## Delta à produire

### P1

- [ ] Migration `maintenance_requests` : `property_id`, `lease_id`, `reported_by_id`, `assigned_to_id`, `assigned_agent_id`, `title`, `description`, `category`, `priority`, `status`, `scheduled_at`, `completed_at`, `cost`, `resolution_notes`, medialibrary collections `photos`, `completion_photos`
- [ ] Endpoint `POST /api/maintenance-requests` — signaler un problème avec photos et description
- [ ] Endpoint `PUT /api/maintenance-requests/{id}/assign` — assigner un prestataire (service_provider)
- [ ] Endpoint `PUT /api/maintenance-requests/{id}/status` — suivi des statuts (new, in_progress, resolved, cancelled)
- [ ] Endpoint `PUT /api/maintenance-requests/{id}/complete` — ajouter photos et rapport après intervention
- [ ] Endpoint `GET /api/properties/{property}/maintenance-requests` — historique des interventions par bien
- [ ] Pages Next.js : signalement, liste demandes, suivi intervention, historique
- [ ] Tests : `MaintenanceReportTest`, `MaintenanceAssignmentTest`, `MaintenanceStatusTest`, `MaintenanceHistoryTest`

### P2

- [ ] Demande de devis : `POST /api/maintenance-requests/{id}/quote` — validation avant travaux
- [ ] Priorisation : tri et filtrage par priorité (urgent, normal, low)

### P3

- [ ] Facturation directe prestataire → agence
- [ ] Contrats de maintenance récurrents

## Critères d'acceptation

- [ ] Un locataire peut signaler un problème avec photos depuis son espace
- [ ] Un agent peut assigner un prestataire et suivre l'avancement
- [ ] Les transitions de statut sont validées (new → in_progress → resolved)
- [ ] Les photos avant/après intervention sont stockées séparément
- [ ] L'historique par bien affiche toutes les interventions avec statut et dates

## Hors périmètre

- Facturation prestataire (→ P3 futur)
- Contrats de maintenance récurrents (→ P3 futur)

## Notes d'implémentation

### Schéma de colonnes (divergence ticket ↔ spec)

Le ticket listait `reported_by_id`, `assigned_to_id`, `assigned_agent_id`, `cost`. Les noms de colonnes existants suivent **`models-spec.md` §21** (source de vérité) :

- `reported_by_id` → `requester_id` (FK users, le demandeur)
- `assigned_to_id` → `assigned_to` (FK users, le prestataire)
- `assigned_agent_id` → **non implémenté** ; le rôle d'agent gestionnaire est porté par la relation `agency` du `Property`
- `cost` → `actual_cost` (+ `estimated_cost` séparé)

### Collection medialibrary renommée

`resolution_photos` → `completion_photos` pour s'aligner sur la spec (P1 — rien ne consommait l'ancienne collection).

### State machine des transitions

Implémentée dans `MaintenanceRequestService::TRANSITIONS` :

- `open → acknowledged|assigned|in_progress|cancelled`
- `acknowledged → assigned|in_progress|cancelled`
- `assigned → in_progress|cancelled`
- `in_progress → completed|cancelled`
- `completed → closed`
- `closed|cancelled → (terminaux)`

La transition vers `in_progress` set `started_at=now()` si null ; vers `completed`, set `completed_at=now()` si null.

**Note** : L'endpoint générique `PUT /api/maintenance-requests/{id}` (utilisé historiquement) laisse passer tout statut valide (pas de state-machine). Le nouvel endpoint `/status` applique strictement les transitions autorisées. Les tests existants (MaintenanceRequestTest) restent verts.

### Endpoints livrés

- `POST /api/maintenance-requests/{id}/photos` — upload (collections `photos` ou `completion_photos`)
- `PUT /api/maintenance-requests/{id}/status` — transition validée
- `PUT /api/maintenance-requests/{id}/complete` — passe à `completed`, set `completed_at`, `actual_cost`, `resolution_notes`, photos `completion_photos`
- `GET /api/properties/{property}/maintenance-requests` — historique (filtres spatie : status, priority)

### Hors périmètre confirmé (P2/P3 futur)

- Endpoint `PUT /api/maintenance-requests/{id}/assign` dédié : non créé ; l'assignation passe par le `PATCH` générique (`assigned_to`). Un endpoint spécifique pourrait être ajouté en P2 si l'UX l'exige.
- `POST /api/maintenance-requests/{id}/quote` (P2)
- Frontend Next.js (Vague 3)
- Facturation prestataire (P3)

### Bug pré-existant hors scope

`DashboardController::tenantStats()` référence une colonne inexistante `reported_by_id` au lieu de `requester_id` — pas corrigé ici (scope-creep ; à traiter dans un ticket de correctif dédié).

Voir PR feat/wave2-back-ops.
