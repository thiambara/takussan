---
id: TCK-083
title: "Pipeline de prospects CRM (kanban + stages + conversion)"
status: done
phase: P2
family: applicatif
estimate: M
wave: 11
created: 2026-04-24
updated: 2026-04-24

depends_on: [TCK-020, TCK-042]
blocks: []
spec_refs:
  features:
    - docs/features.md#16-crm--relation-client
  models:
    - docs/models-spec.md#7-customer
    - docs/models-spec.md#33-customernote-
tags: [back, front, crm, pipeline, agent]
---

## Objectif utilisateur

Offrir à un Agent une vue kanban du pipeline de prospects (lead → prospect →
qualified → negotiating → converted / lost) avec drag-and-drop entre colonnes,
métriques de conversion par stade, et tâches/rappels attachés à chaque customer,
pour piloter sa prospection commerciale.

## Contrat de données

La colonne `Customer.pipeline_stage` (enum `CustomerPipelineStage` : lead,
prospect, qualified, negotiating, converted, lost) existe déjà dans la spec.
Vérifier son implémentation effective en base ; sinon migration additive.

**Endpoints** :

- `GET /api/customers?filter[pipeline_stage]=lead&include=notes,tasks,addedBy&fields[customers]=id,first_name,last_name,pipeline_stage,updated_at`
  — utilisé pour charger chaque colonne kanban. Filtre `pipeline_stage` doit
  être AllowedFilter::exact côté backend.
- `PATCH /api/customers/{id}` body `{ pipeline_stage }` — met à jour le stade,
  enregistre une activité dans ActivityLog avec `old_stage → new_stage`.
- `GET /api/customers/pipeline-stats` — nouveau endpoint : renvoie
  `{ stage: count, stage_changes_last_30d, avg_time_in_stage, conversion_rate }`
  scopé à l'agence de l'agent connecté.
- `POST /api/customers/{id}/tasks` — crée une `Task` polymorphe (déjà en
  spec §32).
- `PATCH /api/tasks/{id}` — update status + due_at.

**Frontend** : page `/app/crm/pipeline` — vue kanban full-width, une colonne
par stade (6 colonnes), cards customer draggable entre colonnes. Section
métriques en haut (widgets stats).

## Direction UX / Artistique

**Kanban horizontal scrollable** sur desktop, **vue liste par stade** sur
mobile (sélecteur de stade en tabs). Les 6 colonnes ont des couleurs
d'ambiance discrètes (lead=neutre, prospect=bleu, qualified=cyan,
negotiating=orange, converted=vert, lost=gris). Width uniforme (~ 300 px) avec
virtualisation si > 50 customers par colonne.

**Card customer** : nom + avatar Customer (initiales si pas de photo), badge
"Ajouté par X", date dernière interaction, icône tâche en cours si
`tasks.count > 0`, actions contextuelles (click → panneau latéral détail).

**Drag feedback** : quand on draggue une card, les colonnes autres que
l'actuelle reçoivent un bord en pointillé ; au drop, animation de slide + toast
discret "Déplacé vers {stage}" + undo 5 s.

**Panneau latéral détail** : sans quitter le kanban, ouvre `<Sheet>` à droite
avec notes + tâches + infos bien cibles. Tabs : Overview / Notes / Tâches /
Activités.

**Métriques top-bar** : 4 widgets — "Prospects actifs", "Nouveaux cette
semaine", "Taux de conversion 30j", "Temps moyen en qualified". Click sur un
widget → drill-down.

## Contraintes strictes (métier)

- **Scope agence + permissions** — un agent ne voit que les customers dont
  `added_by_id = user_id` OU ceux liés à l'agence avec permission
  `customers.view_all`. La policy `CustomerPolicy@view` existe déjà — réutiliser.
- **Transitions de stades** : toutes transitions sont autorisées (pas de FSM),
  mais `converted` et `lost` déclenchent un champ obligatoire de contexte
  (motif conversion ou raison perte) enregistré dans `CustomerNote` auto-créée.
- **Tasks scope** — une `Task` attachée à un customer appartient à l'agent
  qui l'a créée (`assigned_to_id = creator par défaut`). L'agent peut réassigner
  à un membre de l'agence uniquement.
- **Rappels** — une `Task` avec `due_at` déclenche une notification in-app +
  email 24 h avant l'échéance. Réutiliser le système de notifications /
  PreferenceResolver (TCK-022 + TCK-070).
- **Drag-drop en conditions dégradées** — si l'API renvoie une erreur au PATCH,
  rollback visuel de la card + toast erreur. Optimistic UI avec rollback.
- **Mobile offline** — lecture seule sur mobile offline (IndexedDB cache 5 min).
  Drag désactivé si pas connecté.

## Delta à produire

- [ ] Vérifier que `Customer.pipeline_stage` existe en base (sinon migration additive)
- [ ] AllowedFilter::exact `pipeline_stage` sur `CustomerController`
- [ ] Endpoint `GET /api/customers/pipeline-stats` (Controller + service `App\Services\Crm\PipelineStatsService`)
- [ ] Controller `TaskController` (index / store / update / destroy) + policies si pas déjà présent — vérifier l'existant TCK-020 / TCK-042
- [ ] Migration `tasks` si pas déjà en base (spec §32)
- [ ] Model `Task` (morphTo `taskable` + enum `TaskStatus` + enum `TaskPriority`)
- [ ] ActivityLog trait sur `Customer` déjà présent — ajouter log explicite sur changement `pipeline_stage`
- [ ] Notification `TaskDueReminderNotification` (envoi 24 h avant due_at via scheduled command)
- [ ] Command `tasks:send-due-reminders` (schedule hourly)
- [ ] Tests `CustomerPipelineTest` (filter, update stage, stats endpoint, scope agence)
- [ ] Tests `TaskReminderTest` (scheduled envoi + idempotence)
- [ ] Page UI `/app/crm/pipeline` avec kanban
- [ ] Composant `PipelineKanban` + `PipelineColumn` + `PipelineCard`
- [ ] Composant `CustomerDetailSheet` (panneau latéral)
- [ ] Composant `PipelineStatsBar` (4 widgets)
- [ ] Tabs dans CustomerDetailSheet : Overview / Notes / Tasks / Activity
- [ ] Drag-drop via @dnd-kit (déjà utilisé dans TCK-071 pour les médias — consolider sur une seule lib si possible)
- [ ] Hook `useCustomerStageMutation` (optimistic + rollback)
- [ ] i18n fr/en/wo (`crm.pipeline.*`)
- [ ] Tests Vitest : `PipelineKanban`, `PipelineStatsBar`, hook stage mutation

## Critères d'acceptation

- [ ] AC1 — `/app/crm/pipeline` affiche 6 colonnes avec les customers de l'agent courant groupés par `pipeline_stage`
- [ ] AC2 — drag-drop d'une card vers une autre colonne appelle `PATCH /customers/{id}` avec le nouveau stage et persiste
- [ ] AC3 — drag vers `converted` ou `lost` ouvre une modale "raison" dont la saisie crée une `CustomerNote`
- [ ] AC4 — widget "Taux de conversion 30j" calcule correctement (converted / (converted+lost)) sur 30 jours
- [ ] AC5 — panneau détail affiche Overview + 3 tabs (Notes, Tasks, Activity) fonctionnels
- [ ] AC6 — création d'une tâche avec `due_at` déclenche une notification 24 h avant (testé via `Notification::fake()`)
- [ ] AC7 — erreur API au drag → card revient à sa colonne d'origine + toast erreur
- [ ] AC8 — agent voit uniquement ses customers (ou ceux de l'agence si permission)
- [ ] AC9 — `GET /customers/pipeline-stats` retourne 4 métriques avec les bons counts

## Hors périmètre

- Segmentation et tags clients (P2 dédié — ticket séparé).
- Campagnes email/SMS ciblées (P3).
- Import CSV prospects (P3).
- Scoring automatique de prospects (pas spec'd).
- Intégration email bidirectionnelle (sync Gmail/Outlook — EF).

## Notes d'implémentation

- **Backend** : `GET /api/customers/pipeline-stats` exposé via `PipelineStatsService` — retourne `stage_counts`, `stage_changes_last_30d`, `avg_time_in_stage`, `conversion_rate`, scopé à l'agence de l'agent (ou self si pas d'agence). `PATCH /customers/{id}` et `/customers/{id}/pipeline-stage` acceptent un `reason` optionnel ; transitions vers `converted` / `lost` créent automatiquement une `CustomerNote` épinglée portant la raison. Customer expose `addedBy`, `notes`, `tasks` includes pour kanban.
- **Tasks** : commande horaire `tasks:send-due-reminders` (job `SendTaskDueReminders` + `TaskDueReminderNotification`) — fenêtre 24h avant `due_at`, idempotente via `tasks.metadata.reminder_24h_sent_at` (migration additive). `task_due_reminder` enregistré dans `PreferenceResolver::EVENTS`.
- **Frontend** : `/app/crm/pipeline` rend 6 colonnes via `PipelineKanban` + `PipelineColumn` + `PipelineCard`. Drag-drop optimistic via `@dnd-kit/core` (déjà standard ailleurs avec @dnd-kit). `useCustomerStageMutation` rollback en cas d'erreur API + toast. `ReasonDialog` exigé pour `converted` / `lost`. `CustomerDetailSheet` panneau latéral avec 4 tabs (Overview / Notes / Tasks / Activity). `PipelineStatsBar` consomme `pipeline-stats`.
- **Sparse fieldsets** : tous les `useApiQuery` utilisent `fields[customers]`, `include=addedBy,notes,tasks`, `filter[pipeline_stage]` (Spatie AllowedFilter::exact). `pipelineKeys` factory pour les queryKey.
- **Hors périmètre** confirmés : segmentation/tags, campagnes, import CSV, scoring auto, sync email Gmail/Outlook (EF).
- **Tests** : 14 backend (`CustomerPipelineTest` 8 + `TaskReminderTest` 6) + 8 Vitest (`PipelineKanban` 4 + `PipelineStatsBar` 2 + `useCustomerStageMutation` 2). Lint clean (0 errors).
- **Dette** : ajouter `dnd-kit/core` ^6.3.1 dans `package.json` (manquait — installé ce ticket).
- **PR** : feat/tck-083-crm-prospect-pipeline → dev (à ouvrir).
