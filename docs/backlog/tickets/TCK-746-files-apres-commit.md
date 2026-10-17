---
id: TCK-746
title: "Files : after_commit sur toutes les connexions, une écriture annulée n'envoie rien"
status: done
phase: P2
family: tech-debt
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-5--jobs-planifiés-et-files"
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-11--notifications--doublons-préférences-échecs"
tags: [back, queue, notifications, pistes]
---

## Contexte

Réfs : **P05.05** et **P11.09** du fichier de pistes, toutes deux `validé` par le porteur
(critère accordé : V6). Même cause, même correctif : un seul ticket.

`config/queue.php` pose `after_commit => false` sur les quatre connexions qui écrivent vers un
transport (`database`, `beanstalkd`, `sqs`, `redis`). Un job, une notification `ShouldQueue` ou un
écouteur mis en file dans une transaction (`LateFeeCalculator`, `BookingExpirationService`, …)
entre dans la file avant le commit. Avec la file `database` sur la connexion par défaut, la ligne
`jobs` est annulée avec la transaction : le comportement est juste par accident. Une file Redis ou
SQS enverrait des notifications pour des écritures annulées.

## Décision du porteur

after_commit => true sur les connexions de file

## Objectif utilisateur

Personne ne reçoit de notification pour une opération qui n'a pas eu lieu, quel que soit le
transport de la file.

## Contraintes strictes

- `sync`, `deferred`, `background` et `failover` n'ont pas de transport propre : ils ne portent pas
  la clé (`failover` délègue à `database`, qui la porte).
- Hors transaction, le dispatch reste immédiat.

## Delta à produire

- [x] `config/queue.php` : `after_commit => true` sur `database`, `beanstalkd`, `sqs`, `redis`.
- [x] `tests/Feature/Queue/QueueAfterCommitTest.php` : la propriété de configuration, et le
      comportement observé sur la file `database`.

## Critères d'acceptation

- [x] AC1 — Toute connexion de file à transport porte `after_commit => true`.
- [x] AC2 — Un job mis en file dans une transaction n'a aucune ligne dans `jobs` avant le commit,
      et en a une après.
- [x] AC3 — Une transaction annulée ne laisse rien en file ; hors transaction, le job entre
      aussitôt.

## Hors périmètre

- `ShouldQueueAfterCommit` sur chaque notification (l'autre option de P11.09) : la décision du
  porteur retient la configuration de la connexion.
- Les `->afterCommit()` et `ShouldDispatchAfterCommit` déjà posés restent : redondants, sans effet
  contraire.

## Notes d'implémentation

- **Ablation** : `after_commit` remis à `false` → 2 rouges sur 4 (la propriété de configuration ;
  une ligne `jobs` existe avant le commit) ; correctif remis → 4 verts.
- Le test distingue les deux réglages en lisant `jobs` **dans** la transaction : l'annulation seule
  ne les distinguerait pas, la ligne `database` étant annulée avec elle.
- `RefreshDatabase` n'empêche pas l'observation : le gestionnaire de transactions de Laravel ignore
  la transaction du test, et les rappels d'après commit partent au commit de la transaction
  interne.
- `config/` est un déclencheur dur d'`impacted-tests` (suite entière) : ont été jouées les classes
  qui basculent la file sur `database` ou lisent `QUEUE_CONNECTION`.
