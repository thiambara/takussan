---
id: TCK-2408
title: "La sonde des workers surveille la file ai : un worker-ia arrêté lève une alerte"
status: todo
phase: P2
family: technique
estimate: S
wave: 80
created: 2026-10-29
updated: 2026-10-29
depends_on: [TCK-2402, TCK-2401]
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models: []
tags: [api, healthcheck, queue, worker, alertes, adr-0078]
---

## Objectif utilisateur

Le super-admin est alerté si `worker-ia` s'arrête : sans lui, les annonces saisies dans le Radar
restent à l'étape `captured` et aucune réponse de consentement n'est vérifiée, sans erreur visible.

## Contexte

Relevé pendant l'implémentation de TCK-2402 (ADR-0078, amendement du 2026-10-29), hors de son
périmètre. La file `ai` n'est pas dans `RecordQueueHeartbeat::QUEUES` : la sonde `workers` de
`HealthcheckService` ne la regarde pas, et `RecordWorkerHeartbeat` ignore ses battements
(`beat()` écarte toute file hors de la liste).

La sonde `queue` (âge du plus ancien job disponible, 600 s `degraded`, 3 600 s `failed`) la couvre
indirectement dès qu'un job y attend, donc seulement quand quelqu'un a déjà saisi une annonce.

Ce qui est à trancher en l'implémentant : `worker-ia` n'écrit aucun battement pendant un appel
(jusqu'à 85 s, ni `Looping` ni `JobProcessed`, TCK-934), alors que le seuil `degraded` du battement
est de 180 s. Un appel est borné à 85 s : le seuil actuel tient, mais la marge est à relever.

## Contrat de données

- Aucun endpoint neuf. Sondes `workers` et `queue` de `GET /api/admin/health` ; commande
  `EvaluateOperationalAlerts`.

## Delta à produire

- [ ] `ai` dans `RecordQueueHeartbeat::QUEUES` et la sonde `workers`, avec ses seuils.
- [ ] Un test par sonde, avec ablation (la file retirée de la liste → rouge).

## Critères d'acceptation

- [ ] AC1 — Sans battement de la file `ai` depuis 300 s, la sonde `workers` la déclare `failed`.
- [ ] AC2 — Un appel de 85 s en cours ne la déclare ni `degraded` ni `failed`.

## Hors périmètre

- Le passage de la file sur Redis (ADR-0078, Conséquences).

## Notes d'implémentation

_(à remplir par implementing-specs)_
