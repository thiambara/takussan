---
id: TCK-2836
title: "Au téléphone, la barre d'actions groupées prend la place de la barre d'onglets pendant une sélection — un mécanisme de coque commun aux écrans à sélection"
status: todo
phase: P2
family: front
estimate: M
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: [TCK-2638]
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  models: []
tags: [front, coque, mobile, selection, audit-ux, app, suite-de-tck-2638]
---

## Objectif utilisateur

Au téléphone, pendant qu'il sélectionne plusieurs éléments, l'utilisateur a ses actions groupées
là où il a le pouce : en bas de l'écran, à la place de la barre d'onglets. Elle revient dès que la
sélection est vide.

## Constat (mesuré le 2026-11-14, TCK-2638 lot D)

- Sur `/app/properties` (Gestion et Annonces, 390 px), la barre d'actions groupées est un créneau
  du `FloatingDock` (`useFloatingDockSlot`, TCK-644). Elle flotte **80 px au-dessus** de la barre
  d'onglets, qui reste affichée. Ses cinq commandes sont atteignables, mais la Direction de
  TCK-2638 demande qu'elle se pose « en bas, à la place de la barre d'onglets ».
- La maquette `app-biens` ne dessine pas la sélection. L'écart est écrit dans
  `docs/qa/audit-ux-2026-11/fidelite/TCK-2638.json` (« barre d'actions groupées pendant une
  sélection »).
- D'autres écrans de `/app` sélectionnent en lot : les impayés (`admin/finances/impayes/SelectionDesImpayes.tsx`)
  et, hors de `/app`, la console (`admin/super/moderation.tsx`, `SuperAdminPropertiesTable.tsx`).
  Chacun pose sa barre à sa façon.

## Delta à produire

- [ ] Un mécanisme de **coque**, pas d'écran : un écran déclare « une sélection est en cours »
  (hook ou contexte exposé par `AppShell`, à côté de `data-barre-onglets`, TCK-2481). Tant qu'une
  déclaration est active, sous `md`, la coque masque la barre d'onglets et réserve sa place à la
  barre d'actions de l'écran.
- [ ] La barre d'actions de `PropertyList` s'y branche (téléphone), et garde son créneau du
  `FloatingDock` au bureau.
- [ ] Les impayés (`SelectionDesImpayes`) s'y branchent s'ils posent une barre en bas au téléphone ;
  sinon, on le note.
- [ ] Le lanceur de messagerie et les autres créneaux du `FloatingDock` restent atteignables
  pendant la sélection.

## Critères d'acceptation

- [ ] AC1 — À 390 px sur `/app/properties`, après avoir coché deux biens, aucune barre d'onglets
  n'est visible, et la barre d'actions groupées touche le bas de l'écran, avec la marge de la zone
  sûre (`env(safe-area-inset-bottom)`). Après « Tout désélectionner », la barre d'onglets revient à
  sa place.
- [ ] AC2 — Le contenu de la liste n'est jamais masqué par la barre : le dernier bien de la page
  reste atteignable en faisant défiler, avec ou sans sélection.
- [ ] AC3 — À 1280 px, rien ne change : la barre reste dans son créneau du `FloatingDock`.
- [ ] AC4 — Quitter la page pendant une sélection (lien, retour arrière) rend la barre d'onglets
  sur la page suivante. Une déclaration oubliée ne masque pas la barre pour toujours.
- [ ] AC5 — Un test de la coque échoue si la barre d'onglets reste affichée pendant une sélection
  déclarée, ou si elle ne revient pas quand l'écran qui l'a déclarée est démonté. Vérification par
  ablation.

## Hors périmètre

- Le contenu de la barre d'actions (gestes, bilan) : inchangé depuis TCK-2638.
- La console (`/super-admin`), qui n'a pas de barre d'onglets.

## Notes d'implémentation

_(Rempli pendant le travail.)_
