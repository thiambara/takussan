---
id: TCK-757
title: "Champs faits main à 16 px sous md : plus de zoom iOS au focus"
status: done
phase: P2
family: front
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#19-état-des-lieux--inventaires"
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-8--parcours-sur-téléphone"
tags: [front, mobile, forms, pistes]
---

## Contexte

Réf : **P08.09** du fichier de pistes, `retenu · autonome` (A1). Les primitives `Input` et
`Textarea` écrivent la règle (`ui/input.tsx` : 16 px sous `md`, `text-base md:text-sm`, pour
qu'iOS ne zoome pas au focus). Six champs faits main l'ignorent, en `text-sm` seul : la note
d'une pièce d'état des lieux (`RoomEditor`), les quatre champs d'`InviteAgentDialog` et l'e-mail
d'`InviteMemberDialog`.

## Objectif utilisateur

Saisir dans ces champs sur iPhone sans que la page zoome.

## Contrat de données

Aucun.

## Contraintes strictes

- Bureau (`md` et plus) inchangé : `md:text-sm`.

## Delta à produire

- [x] `text-base md:text-sm` sur les six champs.
- [x] Garde de source `admin/__tests__/champs-sans-zoom-ios.test.ts`, sur les trois fichiers.

## Critères d'acceptation

- [x] AC1 — Aucun `<input>` ni `<textarea>` des trois fichiers n'a `text-sm` sans `text-base`.

## Hors périmètre

- Les cinq autres champs du dépôt en `text-sm` seul, non cités par la piste (relevé au passage :
  `PropertyShareDialog.tsx:74`, `ModerationDetail.tsx:262`, `PropertyModerationDetail.tsx:142`,
  `super/ConfirmActionDialog.tsx`, `users/AdminUsersFilters.tsx:101`, à re-mesurer un par un).
- Passer ces champs sur les primitives `Input` et `Textarea`.

## Notes d'implémentation

- Garde de source : jsdom ne rend aucune taille de police. Avant correctif : 3 rouges, sur les
  six lignes citées. Ablation : les trois fichiers d'avant remis → 3 rouges ; remis → verts, et
  `InviteAgentDialog.test.tsx`, `InventoryDetail.pieces.test.tsx` verts (13/13).
- Le zoom lui-même n'a pas été observé sur un iPhone.
