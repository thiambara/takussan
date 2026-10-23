---
id: TCK-1842
title: "Le front ne demande plus trois paramètres que l'API ignore, et les notes du client se départagent par l'id"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-186--paramètres-du-front-lus-par-une-liste-écrite-à-la-main"
tags: [api, front, crm, super-admin, baux, pistes]
---

## Contexte

Réf : **P186.03** du fichier de pistes, `retenu · autonome` (A3). Trois paramètres envoyés par le
front n'ont aucun effet côté API, dont les listes sont écrites à la main :

- `fetchCustomerNotes` demande `sort=-created_at` ; `CustomerNoteController::index` ne lit aucun
  `sort` et sert les épinglées d'abord, puis les plus récentes, sans départage par l'`id` alors que
  le front lit toutes les pages ;
- `/super-admin/users` demande `include=roles,agentProfiles,ownerProfiles` ;
  `Admin\UserDetailController::index` charge ses relations en dur ;
- `fetchAllLeasePayments` envoie `filter[lease_id]` ; le bail vient de la route.

## Objectif utilisateur

Aucun changement visible : la requête dit ce que l'API fait, et la lecture des notes page par page
ne peut plus perdre ni doubler une note de la même seconde.

## Contrat de données

Aucun. L'ordre servi des notes reste « épinglées d'abord, puis les plus récentes », avec l'`id`
décroissant en dernier critère.

## Contraintes strictes (métier)

- Hypothèse (mode sans humain) : la `Piste` laissait le choix entre faire lire `sort` à l'API et le
  retirer du front ; le classement du mesureur (A3) retient le retrait, qui garde l'ordre servi
  aujourd'hui. L'autre voie n'est pas prise.

## Delta à produire

- [x] `CustomerNoteController::index` : `orderByDesc('id')` en départage.
- [x] `customers.ts` : `fetchCustomerNotes` sans `sort`.
- [x] `super-admin/users/page.tsx` : sans `include`.
- [x] `leases.ts` : `fetchAllLeasePayments` sans `filter[lease_id]`.
- [x] Tests : `CustomerNoteTest::test_les_notes_se_departagent_par_l_id` ; assertions d'absence
  dans `page.test.tsx` (comptes), `notes-du-client-toutes-les-pages.tck-1367.test.tsx`,
  `echeancier-toutes-les-pages.tck-1178.test.ts`.

## Critères d'acceptation

- [x] AC1 — Une note épinglée ancienne et quatre notes de la même seconde → l'épinglée, puis les
  quatre par `id` décroissant.
- [x] AC2 — Aucune requête de `fetchCustomerNotes` ne porte `sort`.
- [x] AC3 — La requête de `/super-admin/users` ne porte pas `include`.
- [x] AC4 — Aucune requête de `fetchAllLeasePayments` ne porte `filter[lease_id]`.

## Hors périmètre

- Faire lire `sort` à `CustomerNoteController` (autre voie de la `Piste`, non prise).

## Notes d'implémentation

- Reproduction : 4 rouges avant correctif (ordre des notes `9,10,11,12` au lieu de `12,11,10,9` ;
  les trois paramètres présents dans les requêtes).
- Ablation : correctif retiré (`git apply -R`) → 1 rouge API, 3 rouges front ; remis → 9/9 et 29/29.
- Le test des notes déplace deux lignes par une mise à jour pour que l'ordre physique ne coïncide
  pas avec l'ordre attendu.
