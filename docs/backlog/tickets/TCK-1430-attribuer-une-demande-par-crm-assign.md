---
id: TCK-1430
title: "« Attribuer » une demande de contact exige aussi `crm.assign` dans l'agence de la demande"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#22-rôles--permissions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-152--gestes-hors-de-appagency-montrés-par-le-rôle-jugés-par-la-capacité"
tags: [front, crm, permissions, pistes]
---

## Objectif utilisateur

Un administrateur d'agence dont le rôle ne porte pas `crm.assign` ne se voit plus offrir
« Attribuer » sur une demande de contact, que l'API lui refuse (403).

## Contexte

Réf : **P152.05** du fichier de pistes, `retenu · autonome` (A1 : la règle est écrite dans
`PropertyContactLeadPolicy::assign`).

Mesuré avant correctif (test ci-dessous, rouge sur `e2959c84c`) : admin `[agency.update]` →
« Attribuer » affiché.

## Hypothèses (mode sans humain)

- Comme l'écrit le classement : `useCan('crm.assign', lead.agency_id)` s'ajoute à la condition
  d'admin, qui reste (la liste des collègues est réservée à l'admin) ; P120.05 la lèvera.
- La capacité n'est lue que pour un admin (`enabled`).

## Delta à produire

- [x] `ContactLeadsInbox` : `peutAttribuer` = admin ET `crm.assign` dans l'agence de la demande.
- [x] Test : un cas neuf de `ContactLeadsInbox.test.tsx` (admin sans la capacité) ; `useCan`
  simulé dans ce fichier.

## Critères d'acceptation

- [x] AC1 — Admin sans `crm.assign` : pas de « Attribuer » ; avec : le geste comme avant.

## Hors périmètre

- Ouvrir « Attribuer » à l'agent qui tient `crm.assign` (P120.05).

## Notes d'implémentation

- Ablation : `ContactLeadsInbox.tsx` rendu → 1 rouge ; remis → 18 verts.
