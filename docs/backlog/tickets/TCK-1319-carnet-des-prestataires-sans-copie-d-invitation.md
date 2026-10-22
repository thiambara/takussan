---
id: TCK-1319
title: "Carnet des prestataires : un actif qui vide ses métiers ou ses zones ne reprend plus ceux de son invitation"
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
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#37-serviceproviderprofile-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-117--clés-de-metadata-des-profils-écrites-par-les-assistants"
tags: [web, prestataire, carnet, pistes]
---

## Contexte

Réf : **P117.01** du fichier de pistes, `retenu · autonome` (A1).

L'invitation écrit métiers et zones dans les colonnes et en copie dans `metadata`. Une liste vide
envoyée à `PATCH …/trades` met la colonne à `null` (contrat de TCK-592), et le carnet
`ServiceProvidersList` retombait alors sur `metadata.trades` / `metadata.intervention_zones` :
il affichait un métier que `filter[specialty]` sur ce métier ne trouvait pas.

## Objectif

La colonne fait foi ; la copie de `metadata` ne sert qu'au profil `draft`.

## Delta à produire

- [x] `ServiceProvidersList` : repli sur `metadata` pour le seul statut `draft`.
- [x] Test du carnet : actif aux colonnes `null` et copie en `metadata` → ni métier ni zone ;
      brouillon → la copie s'affiche.

## Critères d'acceptation

- [x] AC1 — Un prestataire actif aux colonnes `null` n'affiche aucun métier ni zone de la copie.
- [x] AC2 — Un brouillon sans colonnes affiche toujours la copie de l'invitation.

## Hors périmètre

- Retirer la copie de `metadata` à l'acceptation ou à l'écriture de `…/trades` (l'autre voie de la
  Piste) : réécriture de données, écartée au profit de la voie du front.

## Notes d'implémentation

- Ablation : repli inconditionnel remis → `ServiceProvidersList.copie-invitation.test.tsx` rouge
  (« Plomberie » sur la ligne de l'actif) ; correctif → vert. Le cas du brouillon est vert des deux
  côtés : il garde que le correctif n'éteint pas la copie là où elle sert.
