---
id: TCK-934
title: "Le battement d'un worker s'écrit hors de la file : un arriéré ne fait plus déclarer `failed` un worker actif"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#le-battement-dune-file-passe-derrière-son-arriéré--un-worker-vivant-et-occupé-est-déclaré-failed-et-ops_queue_stalled-part"
tags: [back, queue, health, alerts, pistes]
---

## Contexte

Réf : **P43.03** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

Le battement d'une file (`RecordQueueHeartbeat`) est un job mis en file chaque minute sur la
file qu'il surveille. Derrière un arriéré, il attend son tour : la sonde `workers` rend `failed`
à 300 s pour un worker qui travaille, avant que la sonde `queue` ne rende `degraded` à 600 s, et
`ops_queue_stalled` part. `worker-media` dépile `media` avant `reconciliation` : le battement de
`reconciliation` attend tout l'arriéré de `media`.

## Décision du porteur

mesurer la vie du worker hors de la file (événements `Looping` ou `JobProcessed` écrits dans le cache) : un arriéré devant le battement ne fait plus déclarer `failed` un worker actif

## Objectif utilisateur

La console plateforme ne dit « worker en échec » que pour un worker qui ne tourne pas, et non
pour un worker occupé à vider un arriéré.

## Hypothèses (mode sans humain)

- Les deux événements : `Looping` (chaque tour de boucle, avant de prendre un job ou de dormir)
  fait battre toutes les files du worker (`media,reconciliation`) ; `JobProcessed` fait battre la
  file du job dépilé.
- Le battement garde sa clé de cache et ses seuils : la sonde `workers` ne change pas.
- Le job planifié `RecordQueueHeartbeat` reste : il bat encore, et son retrait n'est pas demandé.
- Une exécution `sync` n'est pas un worker et n'écrit rien.

## Delta à produire

- [x] `App\Listeners\Admin\RecordWorkerHeartbeat` (découverte automatique) : `Looping` et
  `JobProcessed`, hors `sync`.
- [x] `RecordQueueHeartbeat::beat()` : l'écriture partagée, réservée aux quatre files surveillées.
- [x] Tests : `WorkerHeartbeatOutsideQueueTest` (4 cas).

## Critères d'acceptation

- [x] AC1 — 50 jobs `media` disponibles depuis 400 s, battement vieux de 400 s, un job `media`
  dépilé par un worker → `workers.queues.media` vaut `ok` ; `default` reste `failed`.
- [x] AC2 — Un tour de boucle d'un worker `media,reconciliation` → les deux files `ok`,
  `notifications-urgent` reste `failed`.
- [x] AC3 — Une exécution `sync` n'écrit aucun battement.
- [x] AC4 — Une file hors des quatre surveillées n'écrit rien.

## Hors périmètre

- La sonde `queue` et `alerts:evaluate`, inchangées : un arriéré de plus de 600 s lève toujours
  `ops_queue_stalled` par la sonde `queue`, ce qui est son rôle.
- La déduplication des battements en file pendant une panne (`ShouldBeUnique`).

## Notes d'implémentation

- Avant correctif : AC1 et AC2 rouges (`failed` au lieu de `ok`).
- Ablations : écriture du `Looping` retirée → AC2 rouge ; écriture du `JobProcessed` retirée →
  AC1 rouge ; garde `sync` neutralisée → AC3 rouge. Tout remis → 4 verts.
- Piège : le worker dispatche `Looping` par `events->until()` (`Worker.php:358`) ; un écouteur
  qui rendrait `false` mettrait le worker en pause. `handle()` ne rend rien.
