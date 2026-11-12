---
id: TCK-2749
title: "L'administrateur d'agence qui est aussi bailleur rejoint « Argent » — son relevé de bailleur porté dans l'écran"
status: todo
phase: P1
family: front
estimate: S
wave: 90
created: 2026-11-12
updated: 2026-11-12
depends_on: [TCK-2677]
blocks: []
spec_refs:
  features:
    - "docs/features.md"
tags: [front, finances, argent, suite-de-tck-2677]
---

## Objectif utilisateur

L'administrateur d'une agence standard qui est AUSSI bailleur dans cette agence arrive, comme les autres
administrateurs, sur « Argent » quand il ouvre `/app/payments` — sans perdre son relevé de bailleur.

## Constat (TCK-2677, décision 2 a)

TCK-2677 a exclu ce cas de la redirection (`isOwner` dans `menerALArgent`,
`takussan-web/src/lib/finances/depuis-les-paiements.ts`) : son onglet des reversements de l'ancien écran porte
`OwnerStatementPanel`, qu'« Argent » n'a pas. Le rediriger lui aurait retiré ce geste.

## Delta

1. `OwnerStatementPanel` (ou son équivalent) accessible depuis « Argent » pour ce seul profil.
2. Retirer l'exclusion `isOwner` de `menerALArgent`.

## Critères d'acceptation

- [ ] AC1 — l'administrateur-bailleur reçoit un 307 de `/app/payments` vers « Argent », mesuré par une vraie requête.
- [ ] AC2 — son relevé de bailleur reste à un geste depuis « Argent ».
- [ ] AC3 — un administrateur qui n'est pas bailleur ne voit aucun relevé de bailleur.
