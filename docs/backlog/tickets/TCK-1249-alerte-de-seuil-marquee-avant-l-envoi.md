---
id: TCK-1249
title: "`dashboard:check-alerts` marque l'alerte avant de l'envoyer et rattrape un envoi qui échoue"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-123--appels-réseau-entre-un-geste-validé-et-sa-trace-ou-sa-notification"
tags: [back, dashboard, notifications, pistes]
---

## Contexte

Réf : **P123.05** du fichier de pistes, `retenu · autonome` (A1 : `cooldown_hours` écrit déjà « un
déclenchement par fenêtre »). Entrée dans le lot de l'angle 97 par sa famille : elle cite
`ThresholdAlertTriggered.php`, que P97.05 (TCK-1245) touche.

`CheckThresholdAlertsCommand` appelait `Notification::send()` avant de poser `last_triggered_at`,
sans `try` : un courriel qui levait arrêtait la tâche et faisait récrire la cloche au passage suivant.

## Objectif utilisateur

Une panne de courriel ne prive plus les autres agences de leurs alertes, et la cloche ne se répète
pas d'heure en heure.

## Contrat de données

Aucun endpoint.

## Contraintes strictes (métier)

- Un déclenchement par fenêtre `cooldown_hours`, que l'envoi réussisse ou non.

## Delta à produire

- [x] `CheckThresholdAlertsCommand` : `last_triggered_at`/`last_value` posés avant l'envoi ; envoi
  dans un `try`, échec rapporté (`report()`), boucle poursuivie. Voie retenue parmi celles de la
  piste : la plus étroite (pas de mise en file de la notification).
- [x] `ThresholdAlertTest::test_un_courriel_qui_echoue_n_arrete_pas_la_tache_ni_ne_fait_recrire_la_cloche`.

## Critères d'acceptation

- [x] AC1 — sous un transport qui lève, deux passages : les deux alertes sont marquées, une seule
  cloche par admin, code de sortie 0.

## Hors périmètre

- Un courriel perdu n'est pas renvoyé : la cloche, écrite avant lui, reste le signal.

## Notes d'implémentation

- Ablation : `try` retiré → 1 rouge (la tâche lève), remis → 14/14. L'ordre (marquer avant
  d'envoyer) n'est pas isolé par le test : avec le `try`, il ne change rien à ce scénario ; il
  protège d'une erreur qui ne serait pas rattrapée.
