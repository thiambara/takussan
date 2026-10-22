---
id: TCK-1240
title: "Enregistrer les conditions particulières saisies à la création d'un bail"
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
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#14-lease-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-114--champs-écartés-par-validated-modules-de-l-à-z-et-server-actions"
tags: [back, leases, pistes]
---

## Contexte

Réf : **P114.01** du fichier de pistes, `retenu · autonome` (A1).

Le formulaire de création d'un bail (`CreateLeaseForm.tsx`) affiche et envoie `special_conditions`.
`StoreLeaseRequest` n'a pas de règle pour ce champ : `validated()` l'écarte, et le bail naît avec
`special_conditions = NULL`. Le renouvellement le recopie ensuite depuis le parent, vide.

## Objectif

`POST /api/leases` enregistre les conditions particulières qu'on lui envoie.

## Contrat de données

`POST /api/leases` accepte `special_conditions` : chaîne, facultative, `null` permis,
5 000 caractères au plus. Aucune autre clé ne change.

## Delta à produire

- [x] `StoreLeaseRequest` : règle `special_conditions` (`nullable|string|max:5000`).
- [x] `LeaseTest` : création avec `special_conditions` relue en base ; 5 001 caractères → 422.

## Critères d'acceptation

- [x] AC1 — Un bail créé avec `special_conditions` la garde en base.
- [x] AC2 — Au-delà de 5 000 caractères, 422 sur `special_conditions`.

## Hors périmètre

- `UpdateLeaseRequest` et `RenewLeaseRequest` (ce dernier l'accepte déjà, sans borne).
- `landlord_id`, envoyé par le même formulaire sans règle (P114.05, à valider).

## Notes d'implémentation

- Hypothèse : la borne de 5 000 est celle que le schéma du front impose déjà
  (`takussan-web/src/lib/schemas/lease.ts:62`) ; la colonne est un `text`.
- Ablation : `StoreLeaseRequest.php` rendu à `HEAD` → 2 rouges (`special_conditions` à `null`,
  201 au lieu de 422) ; correctif remis → 2/2 verts, 13/13 sur `LeaseTest`.
