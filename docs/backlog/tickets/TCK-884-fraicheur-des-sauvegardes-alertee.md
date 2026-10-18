---
id: TCK-884
title: "La fraîcheur des sauvegardes de base est relue dans R2 et alertée sur Telegram"
status: done
phase: P1
family: technique
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, sauvegardes, surveillance, pistes]
---

## Contexte

Piste P42.04 du [fichier de pistes](../../plans/2026-10-15-pistes-d-amelioration.md), décision du
porteur du 2026-10-18. Dokploy notifie l'échec d'une sauvegarde, jamais son absence : une
planification retirée ou un Dokploy arrêté ne produisent aucun message. `seuils.sh` ne regarde que
la mémoire, le disque, le vol de CPU et Dokploy.

## Delta à produire

- `deploy/server/fraicheur-sauvegardes.sh` : la dernière sauvegarde de chaque base, relue dans
  `vps-sauvegardes` sous son préfixe réel, alertée par franchissement (plus de 26 h, moins de 1 Mo,
  moins de la moitié de la précédente, préfixe vide). `ENVOI=0` pour une ablation sans envoi.
- `bootstrap.sh` § 10 (unités), runbook étape 11, relevé de `hebergement.md`.

## Critères d'acceptation

- [x] **AC1** — Installé sur le serveur le 2026-10-18 (`sha256` identique au dépôt) ; `--etat` rend
      la sauvegarde du jour (03:00:06 UTC, 3 086 349 o).
- [x] **AC2** — Ablation, timer arrêté, `ENVOI=0` : `AGE_MAX_H=1` alerte une fois puis se tait ; le
      retour s'annonce une fois puis se tait ; le seuil de taille alerte ; aucun marqueur restant.
- [x] **AC3** — `node scripts/check-shell.mjs` et `check-heredocs.mjs` passent.

## Hors périmètre

- La fraîcheur des archives WAL-G : à ajouter à `PREFIXES` avec l'étape 5 d'ADR-0069.
- L'épreuve de l'alerte d'échec de Dokploy pour une sauvegarde de base (destination au jeton
  révoqué) : demande de casser une destination en service, laissée au porteur.
