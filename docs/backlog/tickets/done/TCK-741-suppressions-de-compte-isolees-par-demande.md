---
id: TCK-741
title: "account:execute-deletions : une suppression en échec ne bloque plus les suivantes"
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
    - "docs/features.md#21-authentification--comptes"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-5--jobs-planifiés-et-files"
tags: [back, scheduler, rgpd, pistes]
---

## Contexte

Réf : **P05.04** du fichier de pistes, `validé` par le porteur (critère accordé : V3).

`ExecuteScheduledAccountDeletions` boucle sur `AccountDeletionService::dueForExecution()` sans
`catch` par demande ni ordre : une `executeDeletion()` qui lève arrête la commande, et toutes les
suppressions échues rendues après elle attendent, à chaque heure, la même panne.

## Décision du porteur

try/catch par demande, journal par SafeExceptionContext (ADR-0044), orderBy scheduled_for

## Objectif utilisateur

Une demande de suppression en échec ne retarde pas celles des autres comptes.

## Contraintes strictes (métier)

- Le journal porte `SafeExceptionContext::of($e)` et l'identifiant de la demande, jamais
  `getMessage()`.
- **Hypothèse** : la commande sort en échec (code 1) quand au moins une demande a échoué, après
  avoir traité toutes les autres : la ligne `failed` de `scheduled_task_runs` reste le signal.
- La demande en échec garde `executed_at` nul : elle est retentée au passage suivant.

## Delta à produire

- [x] `dueForExecution()` : `orderBy('scheduled_for')`.
- [x] `ExecuteScheduledAccountDeletions` : `try/catch` par demande, `Log::error` avec
      `SafeExceptionContext`.
- [x] Test : la première demande lève, la seconde est exécutée, le journal ne porte pas le
      message.

## Critères d'acceptation

- [x] AC1 — Une demande dont l'exécution lève n'empêche pas l'exécution des suivantes.
- [x] AC2 — L'échec est journalisé avec la classe de l'exception, sans son message.
- [x] AC3 — Les demandes sont traitées dans l'ordre de `scheduled_for`.

## Hors périmètre

- Les relances J-7 de la même commande.

## Notes d'implémentation
- **Ablation** : les deux fichiers d'avant → 2 rouges (l'exception remonte de la commande et la
  seconde demande n'est pas exécutée ; l'ordre rendu n'est pas celui de `scheduled_for`) ;
  correctif remis → 8 verts sur les 2 classes qui lisent ces fichiers.
- `executeDeletion()` ouvre sa propre transaction : l'exception qui en sort l'a déjà annulée, et le
  `catch` de la commande, hors transaction, peut poursuivre (piège n° 1 de PostgreSQL évité).
