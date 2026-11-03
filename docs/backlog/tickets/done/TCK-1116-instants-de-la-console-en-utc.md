---
id: TCK-1116
title: "Les instants composés à la main par la console sortent en UTC, `DATE_ATOM`"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-94--réponses-composées-à-la-main-dans-les-contrôleurs--dates-hors-adr-0018"
tags: [back, super-admin, dates, adr-0018, pistes]
---

## Contexte

Réf : **P94.01** du fichier de pistes, `retenu · autonome` (A1 : ADR-0018, accepté, écrit déjà la
forme d'un instant sur le fil, UTC en `DATE_ATOM`).

Quatre clés de la console super-admin sortent telles que PostgreSQL les rend, sans passer par
Carbon : `2026-10-18 21:54:01`, sans `T` ni fuseau. Le front les lit par `new Date(…)`, donc dans
le fuseau du navigateur, puis les formate à Dakar : un opérateur hors UTC lit une heure fausse.

## Objectif utilisateur

L'opérateur de la plateforme lit la bonne heure du dernier paiement d'une agence, de la dernière
exécution du planificateur et de l'échec d'un job, quel que soit le fuseau de son navigateur.

## Contrat de données

- `GET /api/admin/agencies/{agency}/health` → `data.last_platform_payment_at`
- `GET /api/admin/scheduler` → `data.*.last_run_at`
- `GET /api/admin/health` → `data.scheduler.last_run_at`
- `GET /api/admin/jobs/failed` et `/jobs/failed/{id}` → `failed_at`

Forme : celle d'`iso()` de `BaseResource` (ADR-0018), `null` conservé.

## Delta à produire

- [x] `AgencyDetailController::health`, `ScheduledTaskInspector::all`,
      `HealthcheckService::scheduler`, `FailedJobService::present` : la valeur brute passe par
      `Carbon::parse(…)->utc()->format(DATE_ATOM)`, au plus près de la requête.
- [x] Test `tests/Feature/Api/Admin/ConsoleInstantFormatTest.php`, qui asserte la chaîne exacte.

## Critères d'acceptation

- [x] AC1 — une valeur `2026-10-18 21:54:01` en base sort `2026-10-18T21:54:01+00:00` sur chacune
      des cinq réponses ci-dessus.
- [x] AC2 — une agence sans paiement garde `last_platform_payment_at: null`.

## Hors périmètre

- Un helper partagé par les contrôleurs et l'extension de la garde
  `check-resource-date-format.mjs` aux contrôleurs (P94.03, V6, au porteur).
- Le contrat de date de l'agenda (P94.02, au porteur).
- Aucun changement du front : il lit déjà un instant par `new Date(…)`.

## Notes d'implémentation

- Ablation : les quatre sites rendus à `HEAD` → 4 rouges sur 5 (le cas `null` reste vert, il
  garde le `null`) ; correctif remis → 5/5.
- `Carbon::parse` d'une chaîne sans fuseau la lit dans le fuseau de l'application (`UTC`,
  `config/app.php`), qui est celui des colonnes : `->utc()` ne déplace rien, il fixe le suffixe.
