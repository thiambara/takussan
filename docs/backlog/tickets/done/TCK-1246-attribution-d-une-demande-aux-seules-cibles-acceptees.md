---
id: TCK-1246
title: "Attribution d'une demande de contact : le dialogue ne propose que le personnel joignable que l'API accepte"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1244]
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-120--listes-de-personnes-des-sélecteurs-face-au-prédicat-décriture"
tags: [web, crm, demandes-de-contact, pistes]
---

## Contexte

Réf : **P120.01** du fichier de pistes, `retenu · autonome` (A1).

`AttribuerDialog` (`ContactLeadsInbox.tsx`) lit `GET /api/agencies/{id}/members` sans filtre :
il propose les bailleurs, les comptes bloqués et les agents suspendus, que
`POST /api/contact-leads/{lead}/assign` refuse ensuite en 422 (`PersonnelDeLAgence`). Le filtre
`filter[assignable]=1`, qui écrit ce prédicat en SQL, existe sur la même route depuis TCK-1096.

## Objectif

Le dialogue d'attribution ne propose que les cibles que l'API accepte.

## Delta à produire

- [x] `AttribuerDialog` envoie `filter[assignable]=1`.

## Critères d'acceptation

- [x] AC1 — La lecture des membres du dialogue porte `filter: { assignable: 1 }`.
- [x] AC2 — Avec TCK-1244, un administrateur d'agence seul, que l'API accepte comme cible, y
      figure (le filtre `assignable` compte les profils d'admin actifs, la base de `/members` les
      contient désormais).

## Hors périmètre

- Le tri du dialogue (`sort=first_name`), que la `Piste` mentionnait : la mesure l'a laissé à
  P120.05, avec l'ouverture du geste aux agents qui tiennent `crm.assign`.

## Notes d'implémentation

- Ablation : `ContactLeadsInbox.tsx` remis à `HEAD` → le test neuf rouge (`filter` indéfini) ;
  correctif remis → 16/16 verts.
- Ce que rend `filter[assignable]=1` côté API est déjà épinglé par
  `AgencyMembersListTest::test_role_filter_is_bound_to_the_agency_and_assignable_keeps_reachable_staff`.
