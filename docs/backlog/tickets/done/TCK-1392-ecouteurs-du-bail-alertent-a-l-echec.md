---
id: TCK-1392
title: "Écouteurs de l'activation d'un bail : délai entre essais et alerte dès le premier échec"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#26-audit--traçabilité"
  models:
    - "docs/models-spec.md#85-commissionentry-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-142--notifications-et-écouteurs-en-file-sans-backoff-ni-failed-hors-codednotification"
tags: [api, file, commissions, alertes, pistes]
---

## Contexte

Réf : **P142.04** du fichier de pistes, `validé`.

`GenerateCommissionEntries` est le seul chemin qui écrit les lignes de commission d'un bail, et
`CreateTenantOnboardingChecklist` le seul qui crée sa checklist d'entrée. Tous deux sont en file
sur `LeaseActivated`, sans `backoff` ni `failed()` : trois essais en quelques secondes, puis une
ligne de `failed_jobs`, sans alerte (`ops_failed_jobs_spike` attend 20 échecs par heure).

## Décision du porteur

« validé — porteur (2026-10-22) : `AlertsOnFirstFailure` (ou son pendant) et un `backoff` sur les deux écouteurs des commissions »

Critère accordé : V1.

## Hypothèses (mode sans humain)

- « Les deux écouteurs » sont ceux que la `Piste` nomme : `GenerateCommissionEntries` et
  `CreateTenantOnboardingChecklist`. Il n'existe qu'un écouteur des commissions
  (`grep -rli commission app/Listeners`).
- Délai `[60, 300, 900]`, celui des notifications en file (TCK-1352) : les deux effets sont
  rejouables (`insertOrIgnore`, `firstOrCreate`).

## Objectif

Un échec de ces écouteurs se réessaie espacé, et son échec final alerte dès la première fois.

## Delta à produire

- [x] Trait `App\Listeners\Concerns\AlertsOnFirstListenerFailure` : le pendant de
      `AlertsOnFirstFailure` pour un écouteur (`failed($event, $e)`), avec `backoff()`.
- [x] Employé par `GenerateCommissionEntries` et `CreateTenantOnboardingChecklist`.
- [x] Test `tests/Feature/Listeners/EcouteursDuBailEnEchecTest.php`.

## Critères d'acceptation

- [x] AC1 — Le job en file de chaque écouteur porte `backoff = [60, 300, 900]`.
- [x] AC2 — Son `failed()`, appelé par `CallQueuedListener`, écrit `ops_critical_job_failed`
      avec le nom de l'écouteur, sans le message de l'exception.

## Hors périmètre

- Un geste ou une commande qui régénère les commissions d'un bail : non demandé.

## Notes d'implémentation

- Le trait des jobs ne s'emploie pas tel quel : `CallQueuedListener::failed()` passe
  l'événement avant l'exception ; `failed(?Throwable $e)` aurait levé une `TypeError` dans le
  worker.
- Ablation : les deux écouteurs remis à `034d400b2` → 4 rouges ; correctif remis → 4 verts.
