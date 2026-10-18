---
id: TCK-885
title: "La liste des effacements de compte est tenue hors de la base, pour les rejouer après une restauration"
status: todo
phase: P1
family: technique
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: [TCK-883]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [api, rgpd, sauvegardes, adr-0044, pistes]
---

## Contexte

ADR-0044, amendement du 2026-10-18, § B (piste P42.06) : restaurer une sauvegarde antérieure à un
effacement rend le compte en clair, et efface la trace (`account_deletion_requests`,
`privacy_requests`) qui permettrait de le retrouver. La procédure « Après une restauration » de
`hebergement.md` relève les effacements dans la base courante **avant** de restaurer ; elle ne peut
rien si la base courante est perdue.

## Objectif utilisateur

Un compte effacé ne revient jamais, même après la restauration d'une sauvegarde plus ancienne.

## Delta à produire

- Chaque effacement exécuté écrit, hors de la base, l'identifiant de l'utilisateur et l'instant
  (par exemple un objet par jour dans `vps-sauvegardes/effacements/`, ou une ligne dans un journal
  persistant hors du volume de la base). Le choix du support se fait au début du ticket.
- La procédure « Après une restauration » lit cette liste au lieu de la base courante.

## Critères d'acceptation

- [ ] **AC1** — Un effacement exécuté apparaît dans la liste hors base, sans aucune donnée
      personnelle autre que l'identifiant ; un test le garde.
- [ ] **AC2** — La procédure de `hebergement.md` est rejouée une fois sur une copie : un compte
      effacé après la sauvegarde restaurée est ré-effacé depuis la liste.
