---
id: TCK-1504
title: "Les instants composés à la main par les contrôleurs et la console sortent à la forme d'ADR-0018"
status: done
phase: P2
family: back
estimate: M
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-94--réponses-composées-à-la-main-dans-les-contrôleurs--dates-hors-adr-0018"
tags: [back, dates, adr-0018, garde, pistes]
---

## Contexte

Réf : **P94.03** du fichier de pistes, `validé` (critère accordé : V6).

Les réponses composées à la main dans `app/Http/Controllers` et `app/Services/Admin` émettaient
leurs instants sous deux formes, `toISOString()` (`…T12:34:56.000000Z`) et `toIso8601String()`
(`…T12:34:56+00:00`), parfois dans une même réponse ; `AuditLogController` rendait `created_at` en
Carbon brut, et `reported_at` d'un signalement d'avis sortait tel que stocké (`toISOString()`).
Aucune garde ne lisait ces dossiers (ADR-0018 les déclare hors de son périmètre).

## Décision du porteur

validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

## Choix de l'implémenteur

- **Les helpers** : `BaseResource::instantOnWire()` / `calendarDateOnWire()` (statiques, la seule
  écriture de la forme ; `iso()` et `calendarDate()` y délèguent), relayés par
  `Base\Controller::instant()` / `calendarDate()`. Les services de `app/Services/Admin` appellent
  le statique.
- **La garde** : un test d'architecture (`tests/Unit/Architecture/ControllerInstantFormTest.php`),
  et non un contrôle C ajouté à `scripts/check-resource-date-format.mjs` : une garde existante
  est fermée à l'implémenteur (V9), et une garde neuve sous `scripts/` ne tournerait qu'une fois
  branchée dans `repo-ci.yml` (V5). Le test tourne dans la CI de l'API sans branchement. Sa liste
  noire est la plus étroite : `toISOString()` et `toIso8601String()`, les deux formes qui
  cohabitaient ; ni `toDateString()` ni `format()`, qui servent aussi hors réponse (noms de
  fichier, bornes de requête).
- **`reported_at`** se convertit à la lecture (`ReviewController::reports`), sans réécrire les
  lignes stockées (V4).

## Reste à faire

- `PaymentController` (6 sites) : sa clé `date` est figée en `….000000Z` par TCK-1500 (P94.04,
  PR #1180 ouverte au même moment) ; la convertir ici rendrait `pre-dev` rouge à la fusion des
  deux. Exception écrite dans la garde, à retirer une fois TCK-1500 fusionné.
- L'amendement d'ADR-0018 qui étend son contrat aux contrôleurs et à `app/Services/Admin` :
  chemin fermé à l'implémenteur (`docs/adr/`), au porteur.
- Ce que la liste noire ne voit pas : un Carbon rendu brut ailleurs qu'`AuditLogController`, et
  les dates calendaires émises par `toDateString()`/`format()` dans ces dossiers.

## Delta à produire

- [x] Helpers sur `BaseResource` et `Base\Controller`.
- [x] Les sites `toISOString()`/`toIso8601String()` des deux dossiers convertis (hors
  `PaymentController`), plus `AuditLogController::created_at` et `ReviewController::reports`.
- [x] Garde `ControllerInstantFormTest` (liste noire, non-vacuité, exception qui doit encore
  s'appliquer, forme du helper sur une instance `Europe/Paris`).
- [x] `tests/Feature/Http/ControllerInstantsOnTheWireTest.php` : tâche et journal d'audit, par la
  valeur rendue.

## Critères d'acceptation

- [x] AC1 — `GET /api/tasks/{id}` rend `due_at` en `2026-10-18T21:54:01+00:00`.
- [x] AC2 — `GET /api/audit-log` rend `created_at` en `2026-10-18T21:54:01+00:00`.
- [x] AC3 — un `toISOString()` ou `toIso8601String()` réintroduit dans ces dossiers fait rougir
  la garde.

## Hors périmètre

- `ReviewReportService:56` (`app/Services/Review`) stocke toujours `toISOString()` ; la lecture
  convertit.
- Le collecteur de l'agenda (TCK-1502, P94.02) : contrat mural délibéré, hors de ces dossiers.

## Notes d'implémentation

- Ablation garde : `app/` rendu à `pre-dev` → les 2 cas rouges (sites listés ; `instantOnWire`
  absent) ; remis → verts. Ablation valeur : `TaskController` et `AuditLogController` rendus à
  `pre-dev` → 2 rouges (`….000000Z`) ; remis → verts.
- Les sites `toIso8601String()` ne changent pas de valeur (instances UTC, sans microsecondes) ;
  seuls les ~25 anciens `toISOString()` et le Carbon brut changent sur le fil. Aucun lecteur du
  front ne compare ces chaînes (`grep` de `000000Z` et `endsWith('Z')` sous `src`, vide).
- La garde retire les commentaires (`token_get_all`) avant de chercher : les docblocks citent les
  deux appels pour dire pourquoi ils sont refusés.
