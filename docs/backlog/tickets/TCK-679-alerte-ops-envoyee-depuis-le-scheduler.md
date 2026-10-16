---
id: TCK-679
title: "Les alertes d'exploitation ops_* partent de façon synchrone depuis le scheduler, et non sur la file qu'elles surveillent"
status: done
phase: P0
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#26-audit--traçabilité
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-14--observabilité--ce-quon-ne-verrait-pas-en-production
tags: [back, alertes, exploitation, pistes]
---

## Contexte

Réf : **P14.01** du fichier de pistes, `validé` par le porteur (critère accordé : V5).

`alerts:evaluate` (scheduler) écrit l'activité `ops_queue_stalled` quand la file s'arrête.
`DispatchAlerts` la reçoit de façon synchrone, mais `AlertRuleService::dispatchForActivity`
mettait l'alerte en file par `SendAdminAlert::dispatch`, donc sur `default`, que seul le conteneur
`worker` consomme. Si ce worker meurt ou se fige, l'alerte qui l'annonce attend dans `jobs` qu'il
revienne.

## Décision du porteur

alertes ops_* envoyées de façon synchrone depuis le scheduler

## Objectif

Une alerte dont l'événement commence par `ops_` est livrée dans le processus qui l'évalue, sans
passer par une file. Les autres alertes restent en file.

## Delta à produire

- [x] `AlertRuleService::dispatchForActivity` : pour un événement `ops_*`, `dispatch_sync` du
      `SendAdminAlert` au lieu de sa mise en file.
- [x] Une livraison synchrone en échec est attrapée par règle et journalisée sous la forme de
      `SafeExceptionContext` (ADR-0044) : elle ne fait tomber ni la commande ni les autres règles.
- [x] Test `tests/Feature/Admin/Platform/OperationalAlertDeliveryTest.php`, sous la connexion de
      file `database`.

## Critères d'acceptation

- [x] AC1 — File `default` à l'arrêt, connexion `database` : `alerts:evaluate` poste le webhook de
      la règle `ops_queue_stalled`, aucun `SendAdminAlert` n'est en file, et `last_triggered_at`
      est posé.
- [x] AC2 — Une alerte `super_admin_user_blocked` reste en file et n'envoie rien sur-le-champ.
- [x] AC3 — Deux règles sur `ops_queue_stalled`, l'une dont le webhook rend 500 : la commande
      réussit, l'autre règle est livrée, la règle en échec voit `failure_count` passer à 1, et la
      transition suivante (`ops_health_degraded`) est encore écrite.

## Hypothèses (mode sans humain)

- « depuis le scheduler » : dans le processus qui évalue l'alerte. Les trois événements `ops_*`
  ne sont écrits que par `alerts:evaluate`, planifié dans le conteneur `scheduler`
  (`routes/console.php`). Rien ne change dans `deploy/`.
- « ops_* » se lit sur le préfixe du nom d'événement, comme l'écrit `AlertableEvents`.
- Une alerte synchrone n'est plus retentée (`$tries = 3` ne joue que sous un worker). Le choix
  d'un canal hors application (le Telegram de `seuils.sh`, évoqué par la `Piste`) n'est pas fait.
- Le bouton « tester » d'une règle (`AlertRuleService::test`) reste en file : il n'est pas émis par
  le scheduler.

## Hors périmètre

- Un nouvel essai d'une alerte `ops_*` dont la livraison échoue : l'état de transition est déjà
  posé, elle ne repartira qu'à la transition suivante.
- La surveillance du scheduler lui-même (P14.02).

## Notes d'implémentation

- Rouge avant correctif : AC1 et AC3 échouent sur `Http::assertSent`, l'alerte étant restée dans
  `jobs`. Sous `QUEUE_CONNECTION=sync` (celle de `phpunit.xml`), le défaut ne se voit pas : le test
  force `queue.default = database`.
- Ablation : correctif entier retiré → AC1 et AC3 rouges ; seul le `try/catch` retiré → AC3 rouge
  sur `RequestException`, qui remonte de l'écouteur de création du journal jusqu'à la commande.
  Correctif remis : 3 verts.
- La file `sync` appelle `SendAdminAlert::failed()` avant de relever l'exception : le compte
  d'échecs de la règle est tenu sans code de plus.
