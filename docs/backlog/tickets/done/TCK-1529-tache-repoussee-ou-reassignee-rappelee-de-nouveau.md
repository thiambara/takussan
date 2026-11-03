---
id: TCK-1529
title: "Une tâche repoussée ou réassignée après son rappel est rappelée de nouveau, à qui la tient"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  models:
    - "docs/models-spec.md#32-task-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#une-tâche-repoussée-ou-réassignée-après-son-rappel-nest-plus-jamais-rappelée"
tags: [api, tasks, reminders, scheduler, pistes]
---

## Contexte

Réf : **P169.02** du fichier de pistes, `retenu · autonome` (A1).

`SendTaskDueReminders` pose `metadata.reminder_24h_sent_at` une fois et la lit sans regard pour
`due_at` ni pour l'assigné. `TaskController::update` écrit `due_at` et `assigned_to_id` par
`fill($data)->save()` sans toucher la marque : une tâche repoussée ou réassignée après son rappel
n'était plus jamais rappelée.

## Objectif utilisateur

TCK-083 et le docblock du job : un rappel à l'assigné ~24 h avant `due_at`. L'assigné d'une tâche
repoussée, ou son nouvel assigné, reçoit ce rappel avant la nouvelle échéance.

## Delta à produire

- [x] `Task::REMINDER_MARKER` et un crochet `updating` : quand `due_at` ou `assigned_to_id` change,
  la marque est retirée de `metadata` (option « par un observateur du modèle » de la Piste, posée
  dans `booted()` : un seul point, quel que soit le geste — `update`, passation, absence).
- [x] `SendTaskDueReminders::META_MARKER` lit cette constante.
- [x] `TaskReminderTest` : trois cas.

## Critères d'acceptation

- [x] AC1 — rappel à A, `PATCH` qui repousse à J+5 et réassigne à B, job à J+4 → un rappel à B,
  aucun de plus à A.
- [x] AC2 — rappel, `PATCH` qui repousse seulement → un second rappel à l'assigné.
- [x] AC3 — `PATCH` qui ne touche ni l'échéance ni l'assigné → marque gardée, aucun doublon
  (l'idempotence reste gardée).

## Hors périmètre

- **Reste** : la passation (`AgentHandoverService`, catégorie `tasks`) réassigne par
  `DB::table('tasks')->update()`, sans événement de modèle : la marque y survit. Relevé en
  relisant les appelants, non mesuré par un test ; laissé hors du diff (pas d'extension de
  périmètre), et écrit en reste de l'entrée.

## Notes d'implémentation

- Le crochet ne voit que les écritures par modèle (`save()`, `update()` d'instance) ; une écriture
  par requête ne déclenche pas d'événement (cf. Hors périmètre). `AgentHandoverTest` et
  `AgentAbsenceTest` restent verts.
- Avant correctif : AC1 et AC2 rouges (0 rappel à B ; 1 rappel au lieu de 2). Ablation (garde
  `isDirty` remplacée par un retour immédiat) : les deux mêmes rouges ; correctif remis → 13/13.
