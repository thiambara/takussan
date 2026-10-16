---
id: TCK-691
title: "Le numéro des tentatives d'envoi est effacé à l'anonymisation, et les tentatives purgées après 90 jours"
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
  models:
    - docs/models-spec.md#69-notificationdeliveryattempt-
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-19--rétention-des-tables-qui-grossissent
tags: [api, rgpd, compte, notifications, sms, pistes]
---

## Contexte

Réf : **P19.02** du fichier de pistes, `validé` par le porteur (critère accordé : V3).

Chaque envoi SMS ou WhatsApp écrit une ligne de `notification_delivery_attempts` avec `to`, le
numéro du destinataire (`SmsRouterDriver`, `WhatsappChannel`). `AccountDeletionService::anonymize()`
ne touche pas cette table. La FK vers `app_notifications` est en `cascadeOnDelete`, mais le compte
n'est que soft-deleted : rien ne cascade, et le numéro survit à l'effacement. Aucune commande
planifiée ne purge la table.

## Décision du porteur

to mis à null à l'anonymisation ; tentatives purgées après 90 jours

## Objectif

Après l'exécution d'une suppression de compte, aucune tentative d'envoi ne porte plus son numéro ;
et aucune tentative ne reste en base plus de 90 jours.

## Delta à produire

- [x] `AccountDeletionService::anonymize()` : `to` mis à `null` sur les tentatives des
      notifications du compte (`app_notifications.user_id`). Les lignes restent (statut, coût,
      dates).
- [x] Commande `notifications:prune-delivery-attempts` : supprime les tentatives dont
      `created_at` a plus de 90 jours.
- [x] Planification quotidienne dans `routes/console.php`, `withoutOverlapping()`.
- [x] Tests : `AccountDeletionExecuteTest::test_execute_efface_le_numero_des_tentatives_d_envoi_du_compte`
      et `PruneNotificationDeliveryAttemptsCommandTest`.

## Critères d'acceptation

- [x] AC1 — Après `executeDeletion()`, aucune tentative ne porte le numéro du compte ; la
      tentative existe toujours, `to` à `null`. La tentative d'un autre compte garde son numéro.
- [x] AC2 — `notifications:prune-delivery-attempts` supprime une tentative de 91 jours, garde
      celle de 89 jours, et ne touche pas la notification.
- [x] AC3 — La commande est planifiée chaque jour, sans chevauchement.

## Hypothèses (mode sans humain)

- « Les tentatives du compte » se lit : les tentatives des notifications dont `user_id` est ce
  compte. Un numéro saisi ailleurs (un visiteur, un garant) n'est pas rattaché au compte.
- La durée se mesure sur `created_at` de la tentative.
- Heure de la purge : 03:50 (Africa/Dakar), après `webhooks:prune` (03:45), hors des heures
  d'envoi.

## Hors périmètre

- Les notifications elles-mêmes (`app_notifications`), que l'anonymisation laisse : la décision
  du porteur ne porte que sur `to`.
- L'ancienne colonne JSON `app_notifications.delivery_attempts` (TCK-102), que plus aucun code
  n'écrit : non mesurée ici.
- La durée de conservation écrite dans la politique de confidentialité (texte de produit).

## Notes d'implémentation

- Ablation, sur les tests neufs : l'effacement de `to` retiré de `anonymize()` → rouge
  (« une tentative d'envoi porte encore le numéro du compte anonymisé », 1 ligne au lieu de 0) ;
  la suppression de la commande remplacée par un `count()` et la ligne de planification retirée
  → 2 rouges (la tentative de 91 jours existe, l'événement planifié est introuvable). Correctifs
  remis : 10 verts.
- `bin/impacted-tests.php` répond « SUITE ENTIÈRE » pour `routes/console.php` : non lancée ici,
  la CI la joue. Les 14 classes qui lisent la planification ou appellent l'anonymisation ont été
  jouées (92 verts).
