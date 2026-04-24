---
id: TCK-096
title: "Priorisation demandes maintenance"
status: todo
phase: P2
family: applicatif
estimate: S
created: 2026-04-24
updated: 2026-04-24
depends_on: [TCK-030]
blocks: []
spec_refs:
  features:
    - docs/features.md#18-maintenance--interventions
  models:
    - docs/models-spec.md#21-maintenancerequest-
tags: [back, front, maintenance]
---

## Objectif utilisateur

Permettre à un Agent / Bailleur de classer chaque demande de
maintenance par niveau de priorité (`urgent`, `high`, `normal`,
`low`), de trier la file d'attente par défaut sur la priorité, et
de recevoir une notification immédiate dès qu'une demande
`urgent` est créée — pour que les fuites d'eau et coupures
n'attendent jamais derrière une ampoule.

## Contrat de données

Ajout d'un champ `priority` (enum `MaintenancePriority`) sur
`MaintenanceRequest` (spec §21).

**Endpoints** :

- `POST /api/maintenance-requests` — accepte `priority` au create
  (défaut `normal`).
- `PATCH /api/maintenance-requests/{id}` — accepte `priority` à
  l'update (auditée via ActivityLog).
- `GET /api/maintenance-requests?sort=-priority,created_at` — tri
  par défaut côté frontend (priority desc, puis date desc).
- `filter[priority]=urgent,high` — `AllowedFilter::exact` multi-valeurs.

**Frontend** :

- Liste `/app/maintenance` triée par priority desc par défaut.
- Badge priority sur chaque card (couleur + label).
- Filtre rapide multi-priority dans la barre de filtres.
- Sélecteur de priority dans le formulaire create / edit.

## Direction UX / Artistique

**Badge priority** : pastille avec couleur d'ambiance distincte par
niveau (urgent = rouge soutenu, high = orange, normal = neutre /
gris, low = ton très clair). Toujours combiner couleur ET icône
(triangle pour urgent, exclamation pour high, point pour normal,
flèche bas pour low) pour l'accessibilité daltoniens.

**Liste maintenance** : section "Urgent" épinglée en haut quand
≥ 1 demande urgent existe (séparateur visuel), puis le reste trié.
La card urgent a une bordure latérale colorée (4 px à gauche).

**Formulaire create** : sélecteur visuel sous forme de 4 boutons
radio segmentés (pas de dropdown caché) — l'agent voit les 4
options d'un coup d'œil avec leurs couleurs.

**Toast urgent** : quand un agent reçoit une notification
maintenance urgent, le toast est sticky (ne disparaît pas tout
seul) avec action "Voir la demande".

## Contraintes strictes (métier)

- **Enum strict** — `MaintenancePriority` : `urgent`, `high`,
  `normal`, `low`. Toute autre valeur en input renvoie 422.
- **Default `normal`** — si non fourni au create, le champ vaut
  `normal` (migration : not null + default).
- **Audit obligatoire** — chaque changement de priority est tracé
  via ActivityLog (`priority.changed` avec from/to).
- **Notification urgent immédiate** — une demande créée en `urgent`
  envoie une AppNotification + email + push (si configuré) à
  l'agent assigné ET au manager d'agence dans la minute (queue
  prioritaire `notifications-urgent`, pas la queue par défaut).
- **Notification escalade** — si une demande urgent reste en
  status `created` (non assignée) > 30 min, escalade au manager
  d'agence (job scheduled `EscalateUrgentMaintenanceJob`).
- **Tri par défaut** — `sort=-priority,created_at` côté frontend
  uniquement ; le backend reste neutre (pas de scope global qui
  forcerait le tri).
- **Permissions** — modifier la priority requiert `maintenance.update`
  (policy existante TCK-030).

## Delta à produire

- [ ] Migration `add_priority_to_maintenance_requests` (enum, default normal, not null)
- [ ] Enum PHP `App\Enums\MaintenancePriority` (urgent, high, normal, low) — vérifier alignement spec §21
- [ ] Casts + `$fillable` mis à jour sur `MaintenanceRequest` model
- [ ] AllowedFilter `priority` (exact, multi) sur `MaintenanceRequestController`
- [ ] AllowedSort `priority` sur `MaintenanceRequestController`
- [ ] FormRequests `StoreMaintenanceRequest` / `UpdateMaintenanceRequest` étendus (priority validation)
- [ ] Notification `UrgentMaintenanceCreatedNotification` (queue `notifications-urgent`)
- [ ] Job `EscalateUrgentMaintenanceJob` (scheduled hourly)
- [ ] Observer ou event listener qui dispatch la notification au create urgent
- [ ] Tests `MaintenancePriorityTest` (default, validation, filter, sort, audit, notification urgent, escalation)
- [ ] Page UI `/app/maintenance` — liste avec badge priority + filtre + tri
- [ ] Composant `MaintenancePriorityBadge` (couleur + icône + label i18n)
- [ ] Composant `MaintenancePrioritySelector` (4 radios segmentés)
- [ ] Toast urgent sticky (override comportement par défaut sur la notification urgent)
- [ ] i18n fr/en/wo (`maintenance.priority.*`)
- [ ] Tests Vitest badge + selector

## Critères d'acceptation

- [ ] AC1 — `POST /maintenance-requests` sans `priority` crée la demande en `normal`
- [ ] AC2 — `POST /maintenance-requests` avec `priority=urgent` envoie une notification au manager dans la minute (testé via `Notification::fake()` + `Bus::fake()`)
- [ ] AC3 — `GET /maintenance-requests?sort=-priority,created_at` retourne urgent → high → normal → low, puis par date
- [ ] AC4 — `filter[priority]=urgent,high` ne retourne que les demandes des 2 priorités
- [ ] AC5 — un changement de priority est visible dans ActivityLog avec from/to
- [ ] AC6 — la liste UI affiche les badges avec couleur + icône cohérents
- [ ] AC7 — une demande urgent restée non assignée > 30 min déclenche `EscalateUrgentMaintenanceJob` (testé en `freezeTime`)
- [ ] AC8 — toast urgent reste sticky tant que l'utilisateur ne l'a pas dismissé

## Hors périmètre

- SLA temporels par priority (résolution sous X heures) — éventuel ticket P3.
- Notification SMS pour urgent — dépend du provider SMS, hors V2.
- Priorité dynamique calculée (auto-bump si non traitée) — hors scope.
- Vue analytics "temps moyen de résolution par priority" — dashboard séparé.

## Notes d'implémentation

_(à remplir par implementing-specs)_
