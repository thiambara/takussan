---
id: TCK-1328
title: "Gardes de la forme des dates des notifications : émetteurs réels côté API, date et heure côté cloche"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1320]
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#12-appnotification-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-128--dates-des-charges-utiles-de-notification-et-leur-lecture-par-le-front"
tags: [back, front, notifications, tests, pistes]
---

## Contexte

Réf : **P128.06** du fichier de pistes, `validé (délégué)` (V7 accordé, pour la seule part de
tests).

Décision du porteur (déléguée) : les seuls tests : un test d'API qui envoie chaque code à paramètre daté par son émetteur réel et vérifie la forme rangée (`Y-m-d` pour `date`, instant ISO pour `datetime`), et le cas date et heure dans `NotificationRow.test.tsx`, fixtures en `+00:00` ; reste : le texte du fuseau des courriels et SMS de visite, le choix d'un rendu de date unique entre courriel et cloche, et le passage des crédits à un code (reste de P75.05), au porteur

Reste à faire : le texte du fuseau des courriels et SMS de visite, le choix d'un rendu de date
unique entre courriel et cloche, et le passage des crédits à un code (reste de P75.05), au porteur.

Le front devine la nature d'un paramètre à sa forme, l'API la lit dans `NotificationCode::params()` :
aucune garde ne liait la forme émise à la forme déclarée, et la branche date et heure de la cloche
n'était pas testée.

## Objectif utilisateur

Une date de notification s'affiche pareil, qu'elle soit rendue par l'API ou par la cloche.

## Contrat de données

Aucun changement de code applicatif.

## Delta à produire

- [x] Test `FormeDesDatesDeNotificationTest` : chaque code à paramètre daté (21) envoyé par son
  émetteur réel, forme rangée vérifiée ; un cas tient la liste contre le catalogue.
- [x] `NotificationRow.test.tsx` : cas date et heure (fr, en), fixture `created_at` en `+00:00`.

## Critères d'acceptation

- [x] AC1 — `date` rangée en `Y-m-d`, `datetime` en instant ISO 8601 à décalage, pour les 21
  codes datés.
- [x] AC2 — un code daté neuf sans émetteur éprouvé fait rougir le test.
- [x] AC3 — la cloche rend `2026-10-25T14:30:00+00:00` en « 25 oct. 2026, 14:30 » / « 25 Oct
  2026, 14:30 ».

## Hors périmètre

- Le texte du fuseau, le rendu de date unique et les crédits (reste du porteur).

## Notes d'implémentation

- Ablation API : `NotifyDelegationActivated` rangeant `toIso8601String()` et `VisitNotifier`
  rangeant `format('Y-m-d H:i')` → « les visites » et « la délégation activée » rouges ; remis →
  vert. Le cas de couverture a rougi à la première écriture : cinq codes datés manquaient
  (`booking.created/confirmed/rejected`, `visit.rescheduled_by_visitor`,
  `visit.cancelled_by_visitor`), ajoutés.
- Ablation front : la branche date et heure rendue par `fmt.date` → les deux cas rouges ; remise →
  vert.
- Sous la locale `en`, la cloche écrit « 25 Oct 2026, 14:30 » (étiquette Intl du dépôt), pas
  « Oct 25, 2026 ».
