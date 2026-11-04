---
id: TCK-1745
title: "Le lanceur d'une demande d'intervention lit tous les baux en cours, une option par bien"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: [TCK-1367]
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-171--sélecteurs-et-listes-sans-pagination-nourris-par-la-taille-de-page-par-défaut"
tags: [front, maintenance, pagination, pistes]
---

## Contexte

Réf : **P171.01** du fichier de pistes, `validé (délégué)` (V7 accordé).

`MaintenanceNewLauncher` lisait une page de 50 baux `active,terminating`, sans page suivante ni
recherche. Pour le personnel, qui lit les baux de toute l'agence, les biens des baux plus anciens ne
se choisissaient pas, et `?property=X` n'était honoré que dans ces 50 lignes. Un bien porté par deux
baux en cours donnait deux `SelectItem` de même clé.

## Décision du porteur (déléguée)

> le lanceur lit les baux en cours par `useAllOngoingLeases` (toutes les pages, `active,terminating`, TCK-1367) au lieu d'une page de 50, et dédoublonne ses options par bien en gardant le premier bail rendu (le plus récent, celui que `options.find` retient déjà) ; test : 51 baux en cours, le bien du 51ᵉ se choisit, et un bien porté par deux baux ne donne qu'une option ; reste : la recherche serveur du bien

## Reste à faire

> la recherche serveur du bien

## Objectif utilisateur

Le membre du personnel qui ouvre une demande d'intervention peut choisir n'importe quel bien sous
bail en cours de l'agence, une fois chacun.

## Contrat de données

Aucun changement d'API : `GET /api/leases` (`filter[status]=active,terminating`, `-created_at`)
pagine et rend `meta.last_page`.

## Delta à produire

- [x] `MaintenanceNewLauncher` lit par `useAllOngoingLeases` au lieu de `useLeases({ per_page: 50 })`.
- [x] Les options sont dédoublonnées par bien, le premier bail rendu gardé.
- [x] Tests : 51 baux en cours, le bien du 51ᵉ se présélectionne par `?property=` ; deux baux sur un
  bien donnent une option, et le formulaire reçoit le bail le plus récent.

## Critères d'acceptation

- [x] AC1 — le bien du 51ᵉ bail en cours se choisit.
- [x] AC2 — un bien porté par deux baux en cours ne donne qu'une option, celle du bail le plus récent.

## Hors périmètre

- Le reste ci-dessus.

## Notes d'implémentation

- `MaintenanceNewLauncher.test.tsx` (TCK-1436) bouchonnait `useApiQuery`, que le lanceur n'appelle
  plus : il bouchonne désormais `fetch`, et garde le même fait (`active,terminating` demandé, bail
  en préavis proposé).
- Ablation : `MaintenanceNewLauncher.tsx` rendu à `HEAD` → 2 rouges sur 2 (le 51ᵉ bien absent ;
  deux options « Villa Ngor ») ; correctif remis → 2/2 verts.
