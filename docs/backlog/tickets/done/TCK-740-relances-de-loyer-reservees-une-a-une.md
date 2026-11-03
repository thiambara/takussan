---
id: TCK-740
title: "Relances de loyer : réserver et envoyer échéance par échéance"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: [TCK-739]
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-5--jobs-planifiés-et-files"
tags: [back, scheduler, notifications, pistes]
---

## Contexte

Réf : **P05.03** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

`SendLeasePaymentReminders::claim()` pose le marqueur `reminder_<jalon>_sent_at` sur toutes les
échéances du jalon, puis la boucle envoie. Une exception au milieu de la boucle laisse le reste
marqué sans envoi : le rejeu ne le relance jamais.

## Décision du porteur

réserver et envoyer échéance par échéance

## Objectif utilisateur

Un envoi qui échoue ne prive de relance que l'échéance en cours, pas celles qui la suivent.

## Contraintes strictes (métier)

- Le marqueur reste posé sous verrou de ligne, juste avant l'envoi de l'échéance qu'il garde.
- L'échéance dont l'envoi lève reste marquée (au plus une fois pour elle, comme avant).
- **Hypothèse** : le statut et le solde sont relus sous le verrou ; une échéance réglée entre la
  sélection et la réservation n'est pas relancée.

## Delta à produire

- [x] `SendLeasePaymentReminders::claim()` rend les échéances une à une, chacune réservée juste
      avant d'être rendue.
- [x] Test : un envoi qui lève au premier locataire, puis un rejeu, relance le second.

## Critères d'acceptation

- [x] AC1 — Après une exception levée à l'envoi de la première échéance d'un jalon, un rejeu
      relance les échéances suivantes de ce jalon.
- [x] AC2 — Deux passages sans échec n'envoient toujours qu'une relance par jalon.

## Hors périmètre

- Un `$timeout` sur le job, et rendre la réservation en cas d'échec (l'autre option de la piste).

## Notes d'implémentation
- **Ablation** : `claim()` d'avant (tout le jalon réservé, puis la boucle) → 1 rouge, aucune
  relance au rejeu ; correctif remis → 16 verts.
- `claim()` est un générateur : les relations restent chargées d'avance pour tout le jalon, seule
  la réservation se fait échéance par échéance, sous verrou, avec le statut relu.
