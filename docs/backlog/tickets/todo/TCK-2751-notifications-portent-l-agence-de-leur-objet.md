---
id: TCK-2751
title: "Les notifications d'objets d'agence portent target.agency_id — la bascule d'espace de la cloche a enfin un objet"
status: todo
phase: P1
family: back
estimate: M
wave: 90
created: 2026-11-12
updated: 2026-11-12
depends_on: [TCK-2634]
blocks: []
spec_refs:
  features:
    - "docs/features.md"
  models:
    - "docs/models-spec.md"
tags: [back, notifications, multi-espaces, suite-de-tck-2634]
---

## Objectif utilisateur

Une personne qui travaille dans deux espaces (agent d'une agence, propriétaire dans une autre) ouvre depuis la cloche
une notification d'un objet d'agence et arrive sur l'objet, dans le bon espace, au lieu de « Vous n'avez pas accès à
cette action ».

## Constat (contre-vérification de TCK-2634, 2026-11-12, base de démo, lecture seule)

- Aucune des ~3 500 notifications de la démo ne porte `target.agency_id` (relevé SQL par code : `visit.requested`,
  `maintenance.*`, `lease_payment.*`, `booking.*`). Seuls `ThresholdAlertTriggered` et `AgencyUpgrade*` l'émettent.
- Conséquence vue : le compte 176 (agent agence 1, propriétaire agence 2), dans l'espace propriétaire, ouvre une
  « Intervention clôturée » de l'agence 1 → `/app/maintenance/111` rend « Vous n'avez pas accès à cette action.
  Réessayer », sans bascule ni pastille « Dans <espace> ». La bascule de TCK-2634 (AC5) n'a donc pas d'objet sur les
  données réelles.
- « Réessayer » sur un 403 est trompeur : réessayer ne change rien.

## Delta

1. Chaque émetteur de notification dont la cible appartient à une agence pose `target.agency_id` (inventaire des
   émetteurs d'abord, dans les Notes).
2. Les notifications déjà émises : décider (dans les Notes) entre une reprise des données et l'absence de reprise.
3. Le 403 d'un objet d'un autre espace ne propose pas « Réessayer ».

## Critères d'acceptation

- [ ] AC1 — une garde liste les émetteurs d'objets d'agence et rougit sur un émetteur qui ne pose pas `agency_id`.
- [ ] AC2 — le compte 176, dans l'espace propriétaire, ouvre une notification de maintenance de l'agence 1 : la bascule
  vers l'espace agent part (PATCH active-profile), l'objet s'affiche.
- [ ] AC3 — un 403 ne propose pas « Réessayer ».
