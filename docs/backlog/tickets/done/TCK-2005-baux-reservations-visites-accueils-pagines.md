---
id: TCK-2005
title: "Les listes de baux, de réservations, de visites et d'accueils en attente se paginent"
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
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#14-location-longue-durée-baux"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-171--sélecteurs-et-listes-sans-pagination-nourris-par-la-taille-de-page-par-défaut"
tags: [front, baux, reservations, visites, pagination, pistes]
---

## Contexte

Réf : **P171.03** du fichier de pistes, `validé` (V7 accordé).

`LeasesList`, `BookingsList` (par onglet), `VisitsList` (cinq onglets) et
`TenantOnboardingPendingList` lisaient une page de 30 sans page suivante, « voir plus » ni
recherche : la 31ᵉ ligne ne s'atteignait pas, et l'onglet des visites affichait le total de l'API
au-dessus de 30 lignes.

## Décision du porteur

> validation du porteur (2026-10-23) : la recommandation du délégué, sur les quatre listes, `TenantOnboardingPendingList` comprise

Recommandation du délégué : une pagination précédent / suivant sur le modèle de `MaintenanceList` et
`InventoryList` (page dans l'état de la liste, `meta.total` déjà rendu par l'API) pour les quatre
listes, avec un test par liste qui atteint la 31ᵉ ligne.

## Objectif utilisateur

Le personnel atteint chaque bail, réservation, visite et accueil en attente, page par page.

## Contrat de données

Aucun changement d'API : les quatre index acceptent `page` et rendent `meta.last_page`.

## Delta à produire

- [x] Page dans l'état de chaque liste (une par onglet pour les réservations et les visites),
  passée au lecteur, qui l'accepte déjà ; 30 par page gardé.
- [x] `Pagination` de `@/components/console/Pagination` sous chaque liste (aucun texte neuf :
  « Précédent », « Page X sur Y », « Suivant » existent).
- [x] Retour en page 1 au changement de filtre (statut, bien) des baux et de portée « Mes biens »
  des réservations.
- [x] Test : 31 lignes par liste, la 31ᵉ atteinte par « Suivant ».

## Critères d'acceptation

- [x] AC1 — dans chacune des quatre listes, la 31ᵉ ligne se rend en page 2.
- [x] AC2 — sur une seule page, aucune pagination ne s'affiche (comportement de la primitive).

## Hors périmètre

- Un « voir plus » ou une recherche serveur.
- La page dans l'URL.

## Notes d'implémentation

- Ablation : les quatre composants rendus à `HEAD` → 4 rouges sur 4 (aucun bouton « Suivant ») ;
  correctif remis → 4/4 verts.
- `Pagination` se prend à son propre fichier : `@/components/console` ne réexporte aucun module
  client (TCK-1771), l'import par l'index rend `undefined`.
