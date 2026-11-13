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

- [x] AC1 — l'administrateur-bailleur reçoit un 307 de `/app/payments` vers « Argent », mesuré par une vraie requête.
- [x] AC2 — son relevé de bailleur reste à un geste depuis « Argent ».
- [x] AC3 — un administrateur qui n'est pas bailleur ne voit aucun relevé de bailleur.

## Notes d'implémentation (2026-11-13)

- **Où vit le relevé.** Au registre « Reversements » de « Argent » (`AdminFinancesTabs`), au-dessus des
  reversements de l'agence — l'ordre de l'onglet `payouts` de l'ancien écran (`PaymentsTabs`). C'est le même
  composant, `OwnerStatementPanel` sans `landlordId` : le relevé du lecteur. Un geste depuis le point du mois :
  l'onglet « Reversements » au bureau, la ligne « Reversements » au téléphone. `?tab=payouts` de l'ancien écran
  mène au même registre (`adresseDeLArgent`).
- **Qui le voit.** `isOwner(user.roles)`, et `roles` ne porte que les profils actifs de l'agence active
  (`UserResource`, TCK-2002) : le bailleur d'une AUTRE agence ne le voit pas. « À approuver » reste la file de
  l'agence, sans relevé.
- **La redirection.** `menerALArgent` perd l'exclusion `isOwner`. L'hôte (agence `individual`) bailleur de son
  propre parc garde `/app/payments` : la règle du `kind` s'applique avant (ADR-0100 § 5).
- **AC1 — prouvé par les tests, écart écrit (décision de team-lead du 2026-11-13, option b).** Le 307 est prouvé
  par la page rendue avec la vraie décision et la vraie traduction (`page.argent.tck-2677.test.tsx` : `?tab=payouts`
  de l'admin bailleur → `/app/agency/finances?tab=reversements`) et par `mener-a-l-argent.tck-2677.test.ts`.
  **Écart : mesure HTTP à faire** — aucune persona admin + bailleur dans une agence standard sur la démo (relevé en
  lecture seule le 2026-11-13 : les deux seuls couples admin + bailleur, comptes 175 et 176, sont dans les agences
  `individual` 5 et 6). Aucune écriture en base de démo pour la créer.
- **AC2** : `GET /api/owner-statements?period=` sans `landlord_id` ni `agency_id` sert le relevé du lecteur dans
  `staffAgencyId()`, l'agence de l'admin (`OwnerStatementRequest`) — lu dans le code, non mesuré sur un compte,
  pour la même raison.
