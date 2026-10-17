---
id: TCK-737
title: "Tâches planifiées : le verrou withoutOverlapping borné à la période de la tâche"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-5--jobs-planifiés-et-files"
tags: [back, scheduler, ops, pistes]
---

## Contexte

Réf : **P05.01** du fichier de pistes, `validé` par le porteur (critère accordé : V5).

`schedule:work` est le PID 1 du conteneur `scheduler`. Il ne relaie pas SIGTERM aux
`schedule:run` en cours, et un enfant tué au-delà des 10 s de grâce ne rend pas le verrou de
`withoutOverlapping()`. Ce verrou vit dans le cache (Redis en préproduction) pendant
`expiresAt = 1440` minutes : une tâche de 1 à 60 minutes surprise par un redéploiement serait
sautée 24 h.

## Décision du porteur

withoutOverlapping(N) proche de la période, sans toucher deploy/

## Reste à faire

le stop_grace_period dans deploy/, par le porteur, avec P05.06

## Objectif utilisateur

Un redéploiement qui interrompt une tâche planifiée ne la suspend pas plus d'une période.

## Contraintes strictes (métier)

- **N = la période de la tâche, en minutes** : 1 (`everyMinute`), 5 (`everyFiveMinutes`), 15
  (`everyFifteenMinutes`), 60 (`hourly`). Les tâches quotidiennes et mensuelles gardent le défaut
  de 1 440 minutes, qui ne dépasse pas leur période.
- **Hypothèse** : une exécution plus longue que sa période peut alors chevaucher la suivante. Les
  tâches concernées sont annotées idempotentes dans `routes/console.php` (convention de
  `takussan-api/CLAUDE.md`), et aucune n'a un `$timeout` supérieur à sa période (le plus long,
  `SyncPropertyCalendarFeedsJob`, 540 s pour une période de 60 min).
- `deploy/` n'est pas touché.

## Delta à produire

- [x] `routes/console.php` : `withoutOverlapping(N)` sur les 19 tâches infra-quotidiennes.
- [x] Test : `tests/Feature/Console/ScheduleOverlapLockTest.php`, qui parcourt toutes les tâches
      planifiées, déduit la période de l'expression cron, et refuse un verrou plus long.

## Critères d'acceptation

- [x] AC1 — Aucune tâche planifiée `withoutOverlapping` n'a un `expiresAt` supérieur à sa période.
- [x] AC2 — Une tâche ajoutée plus tard sans N, à une période infra-quotidienne, fait rougir le test.

## Hors périmètre

- Le `stop_grace_period` du service `scheduler` dans `deploy/` (reste, ci-dessus).
- Le `retry_after` des files et le partage du worker urgent : P05.06.

## Notes d'implémentation

- **Ablation** : `routes/console.php` d'avant → le test rouge sur les 19 tâches (période 1 à 60,
  verrou 1 440) ; correctif remis → vert.
- Pour un `Schedule::job()` d'un job `ShouldQueue`, le verrou ne couvre que l'envoi en file : N n'y
  change presque rien, mais la règle reste la même pour toutes les entrées.
