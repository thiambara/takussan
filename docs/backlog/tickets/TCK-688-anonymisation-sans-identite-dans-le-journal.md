---
id: TCK-688
title: "L'anonymisation d'un compte ne recopie plus son identité d'origine dans activity_log"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-19--rétention-des-tables-qui-grossissent
tags: [api, rgpd, compte, activity-log, pistes]
---

## Contexte

Réf : **P19.01** du fichier de pistes, `validé` par le porteur (critère accordé : V3 ; le même
classement cite V4 pour la réécriture de l'historique, que la décision ci-dessous tranche).

`User` journalise `email`, `phone`, `first_name`, `last_name` et `username` en `logOnlyDirty()`
(`User::getActivitylogOptions()`). `AccountDeletionService::anonymize()` efface ces champs par un
`forceFill()->save()` puis un `delete()`, sans couper le journal : la ligne `updated` de
l'anonymisation portait l'identité d'origine sous `attribute_changes.old`, et la ligne `created`
du compte la portait déjà. `activitylog:clean` n'est pas planifiée (TCK-537) : ces lignes
restaient sans limite, contre la politique de confidentialité (« les données d'identification du
compte et des profils sont ensuite effacées ou anonymisées »).

## Décision du porteur

anonymiser sans journaliser, et effacer attribute_changes des lignes de ce compte

## Objectif

Après l'exécution d'une suppression de compte, aucune ligne d'`activity_log` ne contient
l'e-mail, le téléphone, les noms ou l'identifiant d'origine du compte.

## Delta à produire

- [x] `AccountDeletionService::anonymize()` : `disableLogging()` sur l'utilisateur autour du
      `forceFill()->save()` et du `delete()`, `enableLogging()` ensuite.
- [x] Même méthode : `attribute_changes` mis à `null` sur les lignes d'`activity_log` dont le
      sujet est ce compte. Les lignes restent (événement, date, causeur).
- [x] Test : `AccountDeletionExecuteTest::test_execute_ne_laisse_pas_l_identite_d_origine_dans_activity_log`.

## Critères d'acceptation

- [x] AC1 — Après `executeDeletion()`, aucune ligne d'`activity_log` ne contient, dans
      `attribute_changes` ni dans `properties`, l'e-mail, le téléphone, le nom, l'identifiant ou
      un prénom antérieur du compte.
- [x] AC2 — L'anonymisation n'écrit aucune ligne neuve dont le sujet est le compte : leur nombre
      est le même avant et après.
- [x] AC3 — La ligne `account.deletion.executed` reste écrite
      (`test_execute_logs_activity_transition_and_sends_notification`, inchangé).

## Hypothèses (mode sans humain)

- « Les lignes de ce compte » se lit : les lignes dont le **sujet** est ce `User`. Les lignes dont
  il n'est que le **causeur** décrivent un autre modèle (un bien, un bail) : effacer leur diff
  détruirait l'historique d'audit de l'agence, et l'identité du compte n'y figure que par
  `causer_id`, qui pointe vers la ligne anonymisée.
- Le `delete()` est lui aussi non journalisé : sa ligne `deleted` ne porterait que des valeurs
  anonymisées, et la trace de l'effacement est déjà `account.deletion.executed`.

## Hors périmètre

- Les lignes dont ce compte est seulement le causeur, et les modèles liés au compte qui
  journalisent eux-mêmes des données personnelles (profils, fiches client) : non relevés ici.
- La purge planifiée d'`activity_log` (TCK-537) et le numéro gardé dans
  `notification_delivery_attempts.to` (P19.02).

## Notes d'implémentation

- Ablation, sur le test neuf : `disableLogging()` retiré → rouge (« 4 is identical to 2 » : les
  lignes `updated` et `deleted` sont écrites) ; effacement des diffs retiré → rouge
  (« activity_log porte encore « aminata.p19@example.test » »). Correctif remis : vert.
- Piège : l'effacement des diffs, qui tourne après le `save()`, masque à lui seul le retrait de
  `disableLogging()` sur l'assertion de contenu. C'est pour cela que l'AC2 compte les lignes.
