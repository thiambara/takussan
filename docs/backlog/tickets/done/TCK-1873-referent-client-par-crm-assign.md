---
id: TCK-1873
title: "« Me désigner » et « Désigner » le référent d'un client ne se montrent qu'avec `crm.assign`"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#22-rôles--permissions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-189--gestes-montrés-par-une-comparaison-didentité-ou-de-rôle-dans-les-détails-refusés-par-la-policy"
tags: [front, crm, permissions, pistes]
---

## Objectif utilisateur

Un membre de l'agence dont le rôle ne porte pas `crm.assign` ne se voit plus offrir « Me désigner »
ni « Désigner » le référent d'un client, que l'API lui refuse (403).

## Contexte

Réf : **P189.04** du fichier de pistes, `retenu · autonome` (A1 : la règle est écrite dans
`SetPrimaryContactCustomerRequest`, TCK-591 : lecture du client **et** `crm.assign`).

Le composant montre « Me désigner » dès que l'appelant n'est pas le référent, et le sélecteur dès
qu'un autre agent existe, sans lire aucune capacité.

## Hypothèses (mode sans humain)

- Comme l'écrit le classement (précédent P152.05, TCK-1430) : `useCan('crm.assign', agencyId)`
  juge les deux gestes ; le titre et le nom du référent restent affichés.
- Sans agence connue, la capacité ne se lit pas et aucun geste ne s'ouvre.
- La liste des agents, qui ne nourrit que le sélecteur, n'est plus demandée sans la capacité.

## Delta à produire

- [x] `CustomerReferent` : « Me désigner » et « Désigner » sous `crm.assign` dans l'agence du client.
- [x] Test : `CustomerReferent` avec et sans la capacité.

## Critères d'acceptation

- [x] AC1 — Sans `crm.assign` : ni « Me désigner » ni le sélecteur ; le référent reste affiché.
- [x] AC2 — Avec `crm.assign` : les deux gestes comme avant.

## Hors périmètre

- Toute règle de l'API, la liste des cibles (P88.03).

## Notes d'implémentation

- Ablation : la condition `crm.assign` retirée des deux gestes → 1 rouge dans
  `CustomerReferent.capacite.test.tsx` ; remise → 2 verts.
- Aucune règle d'API ne change : le correctif est du seul côté du front.
