---
id: TCK-2009
title: "L'historique des interventions d'un bien est branché sur sa fiche, et se pagine"
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
    - "docs/features.md#18-maintenance--interventions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-171--sélecteurs-et-listes-sans-pagination-nourris-par-la-taille-de-page-par-défaut"
tags: [front, maintenance, bien, pagination, pistes]
---

## Contexte

Réf : **P171.08** du fichier de pistes, `validé` (V7 accordé).

`MaintenanceHistoryByProperty` (une page, sans pagination) n'avait aucun appelant : la fonction
« P1 · Consulter l'historique des interventions par bien » (`docs/features.md` § 1.8) n'avait
aucune interface.

## Décision du porteur

> validation du porteur (2026-10-23) : brancher `MaintenanceHistoryByProperty` sur la fiche du bien, avec la pagination de `MaintenanceList` ; le menu du calendrier est reporté

## Objectif utilisateur

Depuis la fiche d'un bien, le personnel et le bailleur relisent toutes les interventions de ce bien,
page par page.

## Contrat de données

Aucun changement d'API : `GET /api/properties/{property}/maintenance-requests` (autorisé par
`PropertyPolicy::view`, borné par `visibleTo`) accepte `page` et rend `meta.last_page`.

## Delta à produire

- [x] Onglet « Historique » de `PropertyDetailTabs` : l'historique des prix, puis les interventions
  du bien (chargé par `next/dynamic`, comme les autres onglets différés).
- [x] `MaintenanceHistoryByProperty` : un titre, la page dans l'état, la pagination de
  `MaintenanceList` (mêmes boutons, mêmes clés `maintenance.list.*`).
- [x] Clé `maintenance.history.title` : fr « Interventions sur ce bien », en « Maintenance on this
  property », wo le français tel quel (wolof en pause).
- [x] Test : la fiche ouverte sur `?tab=history` monte les interventions du bien ; 16 interventions,
  la 16ᵉ atteinte par « Suivant ».

## Critères d'acceptation

- [x] AC1 — l'onglet « Historique » de la fiche montre les interventions du bien.
- [x] AC2 — au-delà d'une page, « Suivant » mène à la page 2.

## Hors périmètre

- Le menu « bien » du calendrier (reporté par le porteur).

## Reste à faire

- Le menu « bien » du calendrier, nourri par une liste de biens à recherche serveur.

## Notes d'implémentation

- Ablation : `MaintenanceHistoryByProperty.tsx` et `PropertyDetailTabs.tsx` rendus à `HEAD` →
  2 rouges sur 2 ; correctif remis → 2/2 verts.
- Le composant étant chargé par `next/dynamic`, le test de la fiche attend son titre
  (`findByRole`).
