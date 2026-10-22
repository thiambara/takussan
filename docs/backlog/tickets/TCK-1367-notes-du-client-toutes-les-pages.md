---
id: TCK-1367
title: "La fiche client et le panneau du pipeline lisent toutes les notes du client, pas les 20 dernières"
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
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-135--listes-écrites-à-la-main-et-lecteurs-qui-ne-lisent-que-la-première-page"
tags: [front, crm, pagination, pistes]
---

## Contexte

Réf : **P135.01** du fichier de pistes, `validé (délégué)` (V7 accordé).

`fetchCustomerNotes` n'envoie ni `page` ni `per_page` et rend `res.data` : `CustomerNoteController::index`
pagine par 20. Un client à 25 notes n'en montre que 20, et l'onglet de la fiche affiche
« Notes (20) ».

## Décision du porteur (déléguée)

> le front lit toutes les pages des notes du client, comme `fetchAllLeasePayments` de TCK-1178, dans `fetchCustomerNotes`, qui sert la fiche `/app/customers/{id}` et le panneau `CustomerDetailSheet` ; l'onglet compte toutes les notes lues ; la frise reste sans pagination ; test : client à 25 notes, les 25 rendues et l'onglet compte « Notes (25) »

## Objectif utilisateur

L'agent qui ouvre un client voit toutes ses notes, et l'onglet en donne le vrai nombre.

## Contrat de données

Aucun changement d'API : `GET /api/customers/{id}/notes` accepte `page` et `per_page`
(`tailleDePage`, plafond `AbstractModel::PER_PAGE_MAX` = 100) et rend `meta.last_page`.

## Delta à produire

- [x] Un lecteur commun de toutes les pages d'une liste paginée, sur le modèle de
  `fetchAllLeasePayments` (pages de 100, borne de pages en garde-fou), réutilisable par les
  autres lecteurs de l'angle 135.
- [x] `fetchCustomerNotes` lit toutes les pages par ce lecteur ; ses deux appelants n'en changent pas.
- [x] Test : client à 25 notes, API bouchonnée à 20 par défaut, les 25 rendues et l'onglet compte
  « Notes (25) ».

## Critères d'acceptation

- [x] AC1 — Pour 25 notes, `fetchCustomerNotes` rend les 25, dans l'ordre de l'API.
- [x] AC2 — L'onglet de la fiche, nourri par ce lecteur, affiche « Notes (25) ».
- [x] AC3 — La frise reste sans pagination.

## Hors périmètre

- La pagination de la frise (comportement visible neuf).
- Le départage du tri de l'API (`pinned`, `created_at` sans `id`) : deux notes de même horodatage
  peuvent changer de page d'une requête à l'autre.

## Notes d'implémentation

- Lecteur commun : `src/lib/queries/toutes-les-pages.ts` (`lireToutesLesPages`, `PAR_PAGE_MAX`),
  repris par les autres lecteurs de l'angle 135 dans le même lot.
- `sort=-created_at` est gardé tel quel : l'API l'ignore (tri en dur `pinned`, puis `created_at`).
- Ablation : `customers.ts` rendu à `HEAD` → 2 rouges sur 2 (20 notes lues, onglet « Notes (20) ») ;
  correctif remis → 2/2 verts.
