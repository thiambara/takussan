---
id: TCK-918
title: "Les notifications in-app lues sont purgées après 6 mois, et la politique le dit"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#23-notifications
    - docs/features.md#210-pages-légales-publiques
  models:
    - docs/models-spec.md#12-appnotification-
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-19--rétention-des-tables-qui-grossissent
tags: [api, front, rgpd, notifications, légal, pistes]
---

## Contexte

Réf : **P19.06** du fichier de pistes, `validé` par le porteur (critère accordé : V3).

Aucune commande ne purge `app_notifications` (`routes/console.php`), et la politique de
confidentialité ne donne aucune durée aux notifications in-app (`privacy.ts` § 6). Mesuré en dev
par le mesureur : 10 271 lignes depuis le 2025-07-24, dont 6 202 lues. Le décalage relève de
TCK-537 (« ce que la politique promet et ce que le code fait ») : la ligne y est ajoutée, comme le
demande la décision.

## Décision du porteur

6 mois pour les notifications lues, ajouté à TCK-537

## Reste à faire

l'index, posé sur une mesure de volume

## Objectif

Aucune notification in-app lue ne reste en base plus de 6 mois après sa lecture, et la politique
de confidentialité l'écrit.

## Delta à produire

- [x] Commande `notifications:prune-read` : supprime les notifications dont `read_at` a plus de
      6 mois. Une notification non lue n'est jamais touchée, quel que soit son âge.
- [x] Planification quotidienne dans `routes/console.php`, `withoutOverlapping()`.
- [x] `privacy.ts` § 6, français et anglais : « Notifications dans l'application : 6 mois après
      leur lecture ». `VERSION_DOCUMENTS` est déjà au 18 octobre 2026, date de ce changement.
- [x] TCK-537 : la ligne ajoutée au contrat de données, tenue par ce ticket.
- [x] Tests : `PruneReadNotificationsCommandTest` (API), `textes.test.ts` (front).

## Critères d'acceptation

- [x] AC1 — `notifications:prune-read` supprime une notification lue il y a 6 mois et 1 jour,
      garde une notification lue il y a 5 mois et une non lue créée il y a 2 ans.
- [x] AC2 — Les tentatives d'envoi de la notification supprimée disparaissent avec elle (clé
      étrangère en cascade).
- [x] AC3 — La commande est planifiée chaque jour, sans chevauchement.
- [x] AC4 — La politique, en français et en anglais, donne la durée des notifications lues.

## Hypothèses (mode sans humain)

- « Lues » se lit `read_at` non nul, la colonne que filtrent la liste et le compteur
  (`NotificationController`). Mesuré par le mesureur : `is_read` et `read_at` ne divergent sur
  aucune ligne.
- Les 6 mois courent depuis `read_at` : une notification ancienne lue hier vit encore 6 mois.
- Heure de la purge : 04:05 (Africa/Dakar), après les autres purges de nuit (03:45 à 03:57) et les deux tâches de 04:00.
- La purge supprime la ligne, elle ne l'anonymise pas : la notification n'a pas d'autre usage
  une fois lue (le résumé quotidien ne lit que les non lues, `DigestBuilderService.php:30`).

## Hors périmètre

- L'index `(user_id, created_at DESC, id DESC)` et l'index partiel du compteur : le porteur le
  garde pour une mesure de volume réel (« Reste à faire »).
- Les notifications non lues, sans durée dans la décision.
- La colonne redondante `is_read`, que lisent encore les deux résumés.

## Notes d'implémentation

- Ablation API : la suppression remplacée par un `count()` et la ligne de planification retirée →
  2 rouges (la notification lue il y a 6 mois et 1 jour existe encore, l'événement planifié est
  introuvable) ; remis → 2 verts. Le cas « non lue créée il y a 2 ans » rougirait sur une purge
  par `created_at`.
- Ablation front : `privacy.ts` d'avant le changement → le test de durée rougit ; remis → vert.
- Deux tâches tournent déjà à 04:00 (UTC, sans fuseau) : la purge part à 04:05, Africa/Dakar
  étant à UTC+0.
