---
id: TCK-1528
title: "Reversement : le choix du bénéficiaire lit les bailleurs actifs et inactifs"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-120--listes-de-personnes-des-sélecteurs-face-au-prédicat-décriture"
tags: [web, api, payouts, reversements, pistes]
---

## Contexte

Réf : **P120.04** du fichier de pistes, `validé` (critère accordé : V1).

`CreatePayoutDialog` lit `GET /api/owners` avec `filter[status]=active` : un bailleur dont le
profil n'est plus actif n'est pas proposé, alors que `PayoutService::create` accepte un
bénéficiaire de l'agence sans filtre de statut (TCK-587) et que des loyers encaissés peuvent lui
rester dus.

## Décision du porteur

> validé — porteur (2026-10-22) : lire les bailleurs `active` et `inactive` qui ont des lignes à reverser dans ce dialogue

## Objectif

Le dialogue de reversement propose les bailleurs `active` et `inactive` de l'agence.

## Delta à produire

- [x] `CreatePayoutDialog` envoie `filter[status]=active,inactive`.
- [x] Test API : `GET /api/owners?filter[status]=active,inactive` rend les profils actifs et
      inactifs, et ni les bloqués ni les brouillons.
- [x] Test front : la lecture des bailleurs du dialogue porte `status: ['active', 'inactive']`.

## Critères d'acceptation

- [x] AC1 — Un bailleur `inactive` de l'agence figure parmi les options du dialogue.
- [x] AC2 — Un bailleur `blocked` ou `draft` n'y figure pas (la décision ne nomme que `active` et
      `inactive`).

## Hypothèse (mode sans humain)

« qui ont des lignes à reverser » est lu comme la raison de la décision (ce sont ces bailleurs
inactifs que le dialogue doit pouvoir choisir), non comme un second filtre : les lignes dépendent
de la période, choisie **après** le bailleur, et `GET /api/payouts/preparation` les rend déjà, le
bouton de création restant inactif sans ligne. Borner la liste aux seuls bailleurs qui ont des
lignes en attente, l'autre voie de la `Piste`, demande un filtre neuf côté API : il est laissé en
reste.

## Reste à faire

- Borner la liste du dialogue aux seuls bailleurs qui ont des lignes à reverser (filtre neuf sur
  `GET /api/owners`).

## Hors périmètre

- Les bailleurs `blocked` (statut que pose la suspension d'un membre) : la décision ne les nomme
  pas.

## Notes d'implémentation

- L'API acceptait déjà la liste (`AllowedFilter::exact` découpe sur la virgule) : le test API
  était vert avant tout correctif, il garde le contrat dont le front dépend désormais.
- Ablation : `CreatePayoutDialog.tsx` remis à `HEAD` → le test front neuf rouge
  (`expected 'active' to deeply equal ['active', 'inactive']`) ; correctif remis → 8/8 verts.
