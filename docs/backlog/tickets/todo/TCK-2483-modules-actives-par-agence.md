---
id: TCK-2483
title: Modules activés par agence — l'admin d'agence retire du menu de son équipe ce que l'agence n'utilise pas
status: todo
phase: P3
family: full
estimate: L
wave: 82
created: 2026-11-05
updated: 2026-11-05
depends_on: [TCK-2478]
blocks: []
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#2-agency"
tags: [front, back, navigation, coque, adr-0089, agence]
---

## Objectif utilisateur

L'admin d'une agence qui n'utilise pas, par exemple, les commissions ou les états des lieux les
retire du menu de toute son équipe, pour un menu à la mesure de l'agence.

## Contrat de données

**Non conçu.** Reporté par le porteur le 2026-11-05 (option (c) de la question « qui décide »,
ADR-0089 § Contexte, point 1). Avant toute implémentation : une décision sur le stockage (réglage
d'agence au catalogue des paramètres, ADR-0065, ou colonne de l'agence), sur la liste des modules
désactivables, et sur ce que devient une page d'un module désactivé ouverte par un lien direct
(l'API la sert-elle encore ?). Probablement un amendement d'ADR-0089.

## Direction UX / Artistique

À définir avec la décision ci-dessus.

## Contraintes strictes (métier)

- Désactiver un module ne retire AUCUN droit : c'est un choix d'affichage, l'API continue de juger
  par capacités — sauf décision contraire écrite dans l'amendement.
- Une destination nécessaire à un parcours en cours (bail actif, paiement dû) ne disparaît pas pour
  le locataire ou le bailleur concernés.

## Delta à produire

- [ ] Décision écrite (amendement d'ADR-0089), puis ce ticket réécrit en delta.

## Critères d'acceptation

- [ ] AC1 — La décision est écrite et validée par le porteur avant toute ligne de code.

## Hors périmètre

- Tout ce qui précède la décision.

## Notes d'implémentation

_(à remplir par implementing-specs)_
