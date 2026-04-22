---
id: TCK-030
title: Maintenance & interventions
status: todo
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

_(à remplir par implementing-specs)_
