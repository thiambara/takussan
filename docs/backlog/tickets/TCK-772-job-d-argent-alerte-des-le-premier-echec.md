---
id: TCK-772
title: "Un job d'argent ou de bail planifié alerte dès son premier échec"
status: done
phase: P2
family: back
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-14--observabilité--ce-quon-ne-verrait-pas-en-production"
tags: [back, front, alertes, jobs, pistes]
---

## Contexte

Réf : **P14.04** du fichier de pistes, `validé` (critère accordé : V7, événement alertable neuf).

`ApplyLateFeesJob`, `SendLeasePaymentReminders` et `SendOverdueRemindersJob` passent par
`Schedule::job`, qui ne fait que les mettre en file : `scheduled_task_runs` les voit `finished`
même quand le worker échoue ensuite. Aucun n'a de `failed()`, et `ops_failed_jobs_spike` n'alerte
qu'à 20 échecs par heure glissante : un échec par nuit ne prévient personne.

## Décision du porteur

failed() sur les trois jobs d'argent et de bail, qui écrit une activité alertable dès le premier échec

## Objectif utilisateur

L'exploitant qui pose une règle sur `ops_critical_job_failed` est prévenu dès le premier échec
définitif de l'un de ces trois jobs.

## Contraintes strictes

- Le message de l'exception n'entre pas dans l'activité (ADR-0044 § 2) : la classe et le point
  de levée, par `SafeExceptionContext`.
- L'événement est un `ops_*` : il part de façon synchrone (TCK-679), sans attendre la file.

## Delta à produire

- [x] `App\Jobs\Concerns\AlertsOnFirstFailure` : `failed()` écrit `activity('Ops')->event('ops_critical_job_failed')` avec `job`, `exception`, `at`.
- [x] Le trait sur les trois jobs.
- [x] `ops_critical_job_failed` dans `AlertableEvents`, et son libellé fr/en/wo (wo : le texte français tel quel, wolof en pause).
- [x] `tests/Feature/Admin/Platform/CriticalJobFailureAlertTest.php`.

## Critères d'acceptation

- [x] AC1 — `failed()` de chacun des trois jobs écrit une activité `ops_critical_job_failed` qui nomme le job et la classe de l'exception, sans son message.
- [x] AC2 — Une règle active sur l'événement envoie `SendAdminAlert` dès le premier échec, de façon synchrone.

## Hors périmètre

- La création par défaut d'une règle sur ce nouvel événement : la commande de P14.03 (#554) crée
  les trois règles `ops_*` qui existaient ; la quatrième se pose dans la console.
- Les autres jobs planifiés.

## Notes d'implémentation

- **Ablation** : le trait retiré des trois jobs → 3 rouges sur 4 (`Call to undefined method …::failed()`) ; remis → 4 verts.
- Le test du front `Alerts.test.tsx` exige un libellé pour chaque clé d'`AlertableEvents` dans les trois langues : l'événement neuf touche donc aussi `takussan-web/src/messages`.
