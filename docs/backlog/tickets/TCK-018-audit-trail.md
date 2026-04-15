---
id: TCK-018
title: Audit & traçabilité
status: todo
phase: P0
family: applicatif
estimate: S
created: 2026-04-15
updated: 2026-04-15
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#26-audit--traçabilité
  models:
    - docs/models-spec.md#13-activitylog--remplacé-par-spatielaravel-activitylog
    - docs/models-spec.md#spatielaravel-activitylog
tags: [back, audit, spatie, activitylog]
---

## Contexte

Le journal d'activité est transversal à toute la plateforme. Spatie/laravel-activitylog remplace le modèle custom `ActivityLog` existant. Ce ticket met en place le logging automatique sur toutes les entités critiques.

## Objectif

Configurer spatie/laravel-activitylog sur les modèles critiques et exposer les endpoints de consultation et filtrage du journal.

## Delta à produire

### P0 — MVP bloquant

- [ ] Installation et configuration `spatie/laravel-activitylog` (`config/activitylog.php`)
- [ ] Trait `LogsActivity` sur les modèles critiques : Property, Booking, Lease, Payment, Customer, User
- [ ] Migration des données existantes si table `activity_log` custom présente
- [ ] Tests : `ActivityLogTraitTest`

### P1

- [ ] Endpoint `GET /api/activity-log` — consultation par entité (`subject_type`, `subject_id`)
- [ ] Filtrage par utilisateur (`causer_id`), date, action (`event`)
- [ ] Page Angular : journal d'activité dans le dashboard admin
- [ ] Tests : `ActivityLogEndpointTest`, `ActivityLogFilterTest`

### P2

- [ ] Export CSV/JSON de l'audit trail (`GET /api/activity-log/export`)

### P3

- [ ] Alertes sur actions sensibles (suppression, changement de rôle)

## Critères d'acceptation

- [ ] Toute création, modification ou suppression d'une entité critique est journalisée automatiquement
- [ ] Le journal affiche l'utilisateur responsable (`causer`), l'entité concernée, et les changements (old/new)
- [ ] Le filtrage par entité, utilisateur et date fonctionne correctement
- [ ] Les propriétés sensibles (password, tokens) sont exclues du log

## Hors périmètre

- Historique de prix (journalisé via `PropertyPriceHistory`, → TCK-019)
- Notes CRM horodatées (→ TCK-020)

## Notes d'implémentation

_(à remplir par implementing-specs)_
