---
id: TCK-2007
title: "La fiche d'agence de la console dit le total de l'équipe et du portefeuille, et mène à la liste entière"
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
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-171--sélecteurs-et-listes-sans-pagination-nourris-par-la-taille-de-page-par-défaut"
tags: [front, console, agence, pistes]
---

## Contexte

Réf : **P171.04** du fichier de pistes, `validé` (V7 accordé).

La fiche d'agence de la console lit 10 membres (`fetchAdminAgencyTeam`) et 8 biens
(`fetchAdminAgencyProperties`) et les rend sans total ni lien : 8 biens sous « Portefeuille »
pour une agence qui en porte 214 (mesuré par le mesureur sur la base de développement).

## Décision du porteur

> validation du porteur (2026-10-23) : la recommandation du délégué

Recommandation du délégué : garder l'aperçu court, afficher le total (`meta.total`) à côté du titre
de chaque onglet et un lien « Voir tout » vers `/super-admin/properties?filter[agency_id]=…` et
`/super-admin/users?agency=…`, plutôt qu'une pagination dans la fiche.

## Objectif utilisateur

L'opérateur de la plateforme sait combien de membres et de biens porte l'agence, et atteint la
liste entière d'un clic.

## Contrat de données

Aucun changement d'API : les deux lectures rendent déjà `meta.total`. Les deux listes visées lisent
déjà leur filtre dans l'URL (`super-admin/properties/page.tsx`, `filter[agency_id]` ;
`super-admin/users/page.tsx`, `agency`).

## Delta à produire

- [x] En-tête des onglets « Équipe » et « Portefeuille » : titre, total, lien « Voir tout ».
- [x] Clé `superAdmin.agencyDetail.seeAll` : fr « Voir tout », en « See all », wo le français
  tel quel (wolof en pause).
- [x] Test : 214 biens, 37 membres ; total rendu, lien vers la liste filtrée.

## Critères d'acceptation

- [x] AC1 — l'onglet « Portefeuille » affiche le total et mène à `/super-admin/properties` filtré
  sur l'agence.
- [x] AC2 — l'onglet « Équipe » affiche le total et mène à `/super-admin/users` filtré sur l'agence.

## Hors périmètre

- Une pagination dans la fiche.

## Notes d'implémentation

- Ablation : `agency-detail.tsx` rendu à `HEAD` → 2 rouges sur 2 (ni total ni lien) ; correctif
  remis → 2/2 verts.
