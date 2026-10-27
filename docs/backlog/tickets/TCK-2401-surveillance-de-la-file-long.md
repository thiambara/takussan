---
id: TCK-2401
title: "La sonde des workers surveille la file long, avec des seuils à la mesure de ses jobs"
status: doing
phase: P2
family: technique
estimate: S
wave: 80
created: 2026-10-27
updated: 2026-10-27
depends_on: [TCK-2397]
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
    - "docs/features.md#26-audit--traçabilité"
  models: []
tags: [api, healthcheck, queue, worker, alertes, adr-0078]
---

## Objectif utilisateur

Le super-admin est alerté si `worker-long` s'arrête, et seulement dans ce cas : un balayage
d'alertes ou une évaluation IA de 30 min ne déclenche pas d'alerte « file bloquée ».

## Contexte

Relevé pendant l'implémentation de TCK-2397 (ADR-0078, 2026-10-27), hors de son périmètre. La
nouvelle file `long` n'est pas dans `RecordQueueHeartbeat::QUEUES` : la sonde `workers` de
`HealthcheckService` ne la regarde pas. Elle reste couverte indirectement par la sonde `queue` (un
`ExpirePendingBookingsJob` y entre toutes les 15 min ; s'il attend plus de 600 s, la file passe
`degraded` et `ops_queue_stalled` se lève).

Mais les seuils sont ceux des files courtes, et ils se trompent dans les deux sens pour `long` :

- **battement** : `worker-long` n'écrit rien pendant un job de 30 min (ni `Looping` ni
  `JobProcessed`, TCK-934) ; ajouter `long` tel quel la déclarerait `failed` à 300 s, chaque matin
  à 09:00 ;
- **âge de la file** : un `ExpirePendingBookingsJob` qui attend derrière un balayage dépasse 600 s,
  et la sonde `queue` lève déjà `ops_queue_stalled` pour un worker en bonne santé.

Ce n'est pas une régression de TCK-2397 : avant lui, les mêmes jobs longs retenaient `default`, et
les deux sondes s'y trompaient de la même façon, sur la file des notifications.

## Contrat de données

- Aucun endpoint neuf. Sonde `workers` et `queue` de `GET /api/admin/health` (statut par
  file) ; commande `EvaluateOperationalAlerts`.

## Contraintes strictes (métier)

- Les seuils de `long` se dérivent du délai de reprise de `database-long` (le plus long job
  possible), pas d'une constante recopiée.
- Les seuils des quatre autres files ne changent pas.
- Un `worker-long` arrêté se voit au plus tard au seuil de `long`, quel que soit l'arriéré.

## Delta à produire

- [x] `RecordQueueHeartbeat::QUEUES` : ajouter `long`.
- [x] `HealthcheckService` : seuils de battement et d'âge de file par file, `long` dérivé de
      `config('queue.connections.database-long.retry_after')`.
- [x] Tests : `HealthcheckProbesTest` — `long` muette au-delà de son seuil → `failed` ; `long`
      silencieuse depuis 20 min (job long en cours) → `ok` ; un job en attente depuis 20 min sur
      `long` → `ok`, sur `default` → `degraded`.

## Critères d'acceptation

- [x] AC1 — Un battement de `long` vieux de 20 min laisse la sonde `workers` à `ok` ; au-delà du
      délai de reprise de `database-long`, elle est `failed`.
- [x] AC2 — Les seuils de `default`, `media`, `notifications-urgent` et `reconciliation` sont
      inchangés (tests existants verts).
- [x] AC3 — Chaque test rougit sans son correctif (ablation consignée).

## Hors périmètre

- Une sonde par worker (nom du conteneur) plutôt que par file.
- Le seuil d'alerte des échecs de jobs.

## Notes d'implémentation

2026-10-27, sur `feat/socle-ia-lot-0`.

- **Seuils de `long`, dérivés de `config('queue.connections.database-long.retry_after')`** (1900 s
  par défaut) :
  - battement : `ok` en deçà du délai, `failed` au-delà. Pas de palier `degraded` : en deçà, le
    silence est celui d'un job en cours ; au-delà, aucun job ne vit plus (ADR-0078), donc le
    worker est arrêté ;
  - âge de la file : `degraded` au-delà d'un délai, `failed` au-delà de deux. Plusieurs jobs longs
    peuvent se suivre (balayages de 09:00 et 09:15, évaluation) ; un seul délai de retard reste une
    attente normale.
- **Contrainte « arrêté, vu au plus tard au seuil, quel que soit l'arriéré »** : le battement de
  `long` est écrit par le worker lui-même (`Looping`, `JobProcessed`, TCK-934), pas par le job
  planifié qui attend derrière l'arriéré. Un `worker-long` arrêté passe donc `failed` au délai de
  reprise, file pleine ou vide. Il fait aussi lever `ops_queue_stalled`
  (`EvaluateOperationalAlerts`, `workers.status === failed`), sans changement de la commande.
- **Le battement planifié de `long`** part sur la connexion par défaut (`database`) et la file
  `long` : `database-long` partage la table `jobs`, et c'est le délai de reprise du worker qui
  dépile (`worker-long`) qui compte. Pas de trait `RunsOnLongQueue` sur `RecordQueueHeartbeat` :
  ce n'est pas un job long, et `LongJobsConnectionTest` tient l'inventaire.
- **AC2** : les seuils des quatre files courtes sont épinglés par un test neuf (180 s → `degraded`,
  3600 s d'attente → `failed`) en plus des tests existants, tous verts.
- **AC3, ablations** (chacune annulée ensuite, `HealthcheckProbesTest`) : `long` retiré de
  `QUEUES` → 3 rouges ; battement de `long` aux seuils courts → 2 ; âge de `long` aux seuils courts
  → 2 ; délai recopié en dur (1900) → 1 ; échec de `long` à 3600 s au lieu de deux délais → 1.
- **Vérifié** : `tests/Feature/Admin/Platform` 273 verts ; gardes du dépôt vertes. Le front
  n'affiche pas de libellé par nom de file : rien à traduire.
