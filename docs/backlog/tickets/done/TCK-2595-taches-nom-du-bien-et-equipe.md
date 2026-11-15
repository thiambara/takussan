---
id: TCK-2595
title: "Tâches : le nom du bien au lieu de « Un bien », les tâches de l'équipe pour l'admin, et le filtre « en retard ou aujourd'hui »"
status: done
phase: P1
family: back
estimate: S
wave: 89
created: 2026-11-10
updated: 2026-11-11
depends_on: []
blocks: [TCK-2596]
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#32-task-"
tags: [back, tasks, crm, audit-ux, app]
---

## Objectif utilisateur

La tâche « Faire signer l'état des lieux d'entrée » dit de quel logement il s'agit ; l'admin voit ce qui traîne dans son équipe ; la journée de l'agent lit en une requête ce qui est en retard ou dû aujourd'hui.

## Contrat de données

**Re-mesuré sur `1bce3798a`** — la cause de « Un bien » (audit § 6, P1) n'est pas le front :
- `TaskController::taskable` (`:212-235`) ne rend le `label` d'un parent que si `TaskPolicy::attachTo` passe ; pour un bien, `attachTo` exige `PropertyPolicy::update` (`TaskPolicy.php:124`), donc `properties.update_any` pour le personnel (`PropertyPolicy.php:156-163`) ; un agent sans cette capacité reçoit `label: null`, et le front affiche « Un bien » (`MyTasks.tsx:138`, `fr.json` `hidden.property`) ;
- l'index ne rend que les tâches assignées à l'utilisateur, créées par lui ou couvertes pendant une absence (`TaskController.php:33-44`) : **aucune vue d'équipe** ;
- `filter[due]` accepte une seule valeur (`overdue|today|upcoming|none`, `Task.php:122-135`).

À changer :
- Le `label` (et la vignette) d'un bien parent se lit sous `PropertyPolicy::view` — la règle de **lecture** du bien —, distincte de `attachTo` (qui reste la règle pour **rattacher** une tâche). Même règle pour le client : `CustomerPolicy::view` (inchangé dans les faits).
- `filter[due]` accepte une liste (`overdue,today`).
- `filter[team]=1` : pour un détenteur de `crm.view_all`, les tâches assignées au personnel actif de l'agence active (avec `filter[assigned_to_id]` pour isoler un agent) ; `include=assignedTo` (`{id, name}`).
- Ressource : `taskable.subtitle` (quartier du bien, ou téléphone formaté du client) pour la ligne.

## Contraintes strictes (métier)

- **Aucune lecture élargie** : un agent ne lit le nom d'un bien que s'il peut ouvrir ce bien ; un test l'affirme dans les deux sens (bien de l'agence lisible → nom ; bien d'un bailleur privé non lisible → `null`).
- `filter[team]=1` sans `crm.view_all` : 403 ; il ne sort jamais de l'agence active.
- Les règles d'écriture ne changent pas : assignation au personnel de l'agence seulement (422 `task.assignee_not_staff`), suppléant pendant une absence, suppression par le créateur seul.

## Delta à produire

- [ ] `TaskController::taskable` sous `view` ; `subtitle`.
- [ ] `filter[due]` en liste ; `filter[team]` ; `include=assignedTo`.
- [ ] Tests : `TaskParentLabelTest` (agent sans `properties.update_any` lit le titre d'un bien de l'agence ; bien non lisible → `null`), `TaskDueListFilterTest`, `TaskTeamFilterTest` (admin → tâches de deux agents ; agent → 403 ; autre agence jamais).

## Critères d'acceptation

- [ ] AC1 (rouge sur `1bce3798a`) — Un agent sans `properties.update_any`, tâche rattachée au F2 de Grand Yoff de son agence : `taskable.label = "F2 · Grand Yoff"` (titre du bien).
- [ ] AC2 — `filter[due]=overdue,today` rend les tâches ouvertes en retard et celles du jour, pas celles de demain.
- [ ] AC3 — L'admin d'agence avec `filter[team]=1` reçoit les tâches de ses agents ; un agent reçoit 403.
- [ ] Ablation consignée (AC1).

## Hors périmètre

- L'écran (TCK-2596).
- La tâche dont le parent est supprimé (TCK-617, point 5, décision en attente).
- Les tâches qui naissent seules des événements (ambition de l'audit, non retenue : la relance proposée est portée par TCK-2581 et TCK-2596).

## Notes d'implémentation

**Livré (2026-11-11, back-3).**

- **Prémisse re-mesurée** : la cause de « Un bien » tenait (`taskable()` jugé sous `attachTo` = `PropertyPolicy::update` pour un bien). Deux écarts : (1) l'assigné était DÉJÀ servi en `assignee: {id, name}` sur toute ligne ; `include=assignedTo` est ajouté comme demandé (relation `Task::assignedTo`, clé `assigned_to` présente seulement quand elle est incluse). (2) **Le rôle système `agent` tient `crm.view_all`** (`SystemRoleCapabilities::agent`) : un agent au rôle par défaut reçoit donc la vue d'équipe (200) ; le 403 de AC3 vaut pour un agent dont le rôle d'agence n'a pas la capacité. **Décision de la session (2026-11-11)** : la vue d'équipe se juge sur la capacité `crm.view_all`, pas sur le rôle — principe du dépôt ; un agent qui lit déjà toutes les fiches de l'agence peut lire les tâches de l'équipe.
- **`taskable`** `{type, id, label, phone, subtitle, cover_url}` : libellé, téléphone, `subtitle` (quartier du bien ; téléphone du client en E.164 par `TelephoneSaisi::normaliser`, mis en forme par le front) et `cover_url` (vignette `thumbnail` du bien par `PublicPhotoUrl`, filigrane respecté, `WatermarkRequirement::attach` pour la page) se lisent sous `view` du parent (`CustomerPolicy::view`, `PropertyPolicy::view`). `attachTo` reste la règle de `store` (docblock de `TaskPolicy::attachTo` mis à jour). L'index charge `address` et `media` des biens parents (`morphWith`).
- **`filter[due]`** : liste séparée par des virgules (`overdue,today`), union des périodes, valeur inconnue ignorée dans la liste (seule : rien), `filter[due][]=` toujours une valeur absente (rien — TCK-1407, ADR-0075) ; `delimiter('')` pour distinguer la chaîne du tableau.
- **`filter[team]=1`** : 403 sans personnel actif dans l'agence du profil actif ou sans `crm.view_all` là ; la portée REMPLACE « mes tâches » : tâches assignées au personnel actif de cette agence (profil agent ou admin actif, ou délégation active, compte ni bloqué ni supprimé — la règle de `filter[assignable]` des membres) ET dont le parent est dans cette agence (`parentInAgency`) ; jamais une tâche personnelle sans parent, jamais une autre agence. `filter[assigned_to_id]` isole un agent. `filter[team]=0` = la liste habituelle.
- **Lecture d'équipe (décision de la session, 2026-11-11 : une ligne qu'on liste s'ouvre)** : `TaskPolicy::view` accorde la tâche d'un collègue à qui tient `crm.view_all` dans l'agence active, exactement dans la portée de `filter[team]=1` (assignée au personnel actif de l'agence, parent dans l'agence) — `readsAsTeam`, sur la même définition d'agence que l'index (`TaskPolicy::teamAgencyOf`, seule source). `update` ne dérive plus de `view` : il garde la règle d'avant (créateur, assigné, suppléant — `participates`), et `UpdateTaskRequest::authorize` délègue à `update` (il déléguait à `view`). `delete` inchangé.
- **Tests** : `TaskParentLabelTest` (AC1 + bien privé d'un bailleur → tout `null` + client), `TaskDueListFilterTest`, `TaskTeamFilterTest` (dont : parité « toute ligne de `filter[team]=1` s'ouvre en `show` », l'admin lit sans modifier/cocher/supprimer, autre agence et sans `crm.view_all` → 403, tâches hors portée → 403) ; `TaskAuthorizationTest` mis à jour (deux clés neuves dans la forme exacte de `taskable`).
- **Ablations** (une à une, restaurées par copie, md5 vérifié) : AC1 `attachTo` au lieu de `view` → 1 rouge ; AC2 sans `delimiter('')` → 4 rouges ; AC3 sans `crm.view_all` → 1 rouge ; AC3 sans `parentInAgency` → 2 rouges ; lecture d'équipe retirée de `view` → 2 rouges ; `UpdateTaskRequest` rendu à `view` → 1 rouge (l'admin modifiait).
- **/sync-specs** : `docs/models-spec.md` § 32 (`taskable.subtitle`/`cover_url`, règle de lecture du libellé, `filter[due]` en liste, `filter[team]`, `include=assignedTo`) ; `docs/features.md` § 16 (vue d'équipe des tâches).

