---
id: TCK-803
title: "Jobs échoués purgés à 30 jours, `queue:prune-batches` planifiée, et journal de `User` nommé"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features: []
  models:
    - "docs/models-spec.md#61-scheduledtaskrun-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-19--rétention-des-tables-qui-grossissent"
tags: [back, scheduler, queue, rgpd, audit, pistes]
---

## Objectif utilisateur

Un job échoué, et les données personnelles que porte son `payload`, ne se conservent pas plus de
30 jours ; les changements d'identité d'un compte se lisent sous un journal qui leur est propre.

## Contexte

Réf : **P19.07** du fichier de pistes, `validé` (critère du dernier classement accordé : V3).
[L'ADR-0044](../../adr/0044-donnees-personnelles-chiffrement-journal-d-agence-registre-des-droits.md) est amendé le 2026-10-16 (TCK-723, § « B. Les jobs échoués sont purgés à 30 jours »),
et renvoie la planification à cette piste.

**Décision du porteur** (recopiée mot pour mot) :

> purge des jobs échoués à 30 jours, `prune-batches`, `useLogName('User')` et `next_due_at`

**Hypothèse notée (mode sans humain)** : pour `next_due_at`, la `Piste` laisse deux options
(« calculer `next_due_at` depuis l'expression cron ou retirer la clé »), et la précision ne
tranche pas. Ce point n'est pas fait ; l'entrée passe à `fait — reste`.

## Contrat de données

- `routes/console.php` : `queue:prune-failed --hours=720` et `queue:prune-batches`, chaque jour.
- `User::getActivitylogOptions()` : `useLogName('User')`. Les lignes déjà écrites sous `default`
  ne sont pas renommées.

## Contraintes strictes (métier)

- La purge ne remplace pas le décorateur `SanitizingFailedJobProvider` (ADR-0044 §2).
- Les deux purges sont idempotentes et `withoutOverlapping()`.

## Delta à produire

- [x] Planification des deux purges, commentées `TCK-803`.
- [x] Docblock de `SanitizingFailedJobProvider` mis à jour (la purge n'y est plus « écartée »).
- [x] `useLogName('User')` sur `User`.
- [x] Test : `Tests\Feature\Console\QueueRetentionScheduleTest` (3 cas).

## Critères d'acceptation

- [x] AC1 — `queue:prune-failed --hours=720` est planifiée chaque jour, sans chevauchement.
- [x] AC2 — `queue:prune-batches` est planifiée chaque jour, sans chevauchement.
- [x] AC3 — une modification de `User` s'écrit sous le journal `User`.

## Hors périmètre

- **Reste à faire** : `next_due_at` de l'inspecteur des tâches, à calculer depuis l'expression
  cron ou à retirer ; la `Piste` laisse le choix ouvert.
- Les lignes de journal de `User` déjà écrites sous `default` (réécriture de données, V4).
- La mention des jobs échoués dans la politique de confidentialité (TCK-537).

## Notes d'implémentation

- Ablation : `routes/`, `app/` revenus à `pre-dev`, les trois tests rougissent (deux purges non
  planifiées, `log_name` = `default`) ; remis, verts.
- `queue:prune-batches` garde la durée par défaut du framework (24 h), comme le dit l'ADR.
