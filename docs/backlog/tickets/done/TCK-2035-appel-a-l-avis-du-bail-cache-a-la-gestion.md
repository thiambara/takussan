---
id: TCK-2035
title: "La fiche d'un bail ne montre pas l'appel à l'avis à la gestion"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#111-avis--réputation"
  models:
    - "docs/models-spec.md#11-review"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-201--gestes-à-usage-unique-jugés-par-une-lecture-déligibilité-faite-au-montage"
tags: [front, avis, bail, pistes]
---

## Objectif utilisateur

L'agent, le bailleur ou l'administrateur d'agence qui ouvre la fiche d'un bail n'est pas invité à
« partager son expérience » sur un bien qu'il gère et qu'il ne peut pas noter.

## Contexte

Réf : **P201.02** du fichier de pistes (`retenu · autonome`, A1).

## Contraintes strictes (métier)

- Le dépôt d'un avis de bien n'accepte que le locataire du bail (`ReviewEligibility::leasesOf`,
  `tenant.user_id`).
- La fiche de réservation écarte déjà la gestion de l'appel (`BookingDetail`, `!isDashboardAgent`) :
  même règle sur la fiche de bail.

## Delta à produire

- [x] `LeaseDetail` : l'appel à l'avis se monte sous `!isAgentSurface`.
- [x] Garde : `LeaseDetail.appel-avis.test.tsx` (rôles de gestion → absent ; locataire → présent).

## Critères d'acceptation

- [x] AC1 — rôles `agent`, `owner`, `agency_admin`, `super_admin` sur un bail `active` avec un bien :
  aucun appel.
- [x] AC2 — le locataire du bail garde l'appel.

## Hors périmètre

- Les statuts qui ouvrent l'appel (TCK-2037, P201.03) ; l'appel masqué après l'avis (reste de P201.03).

## Notes d'implémentation

- La condition retenue est celle que la fiche emploie déjà (`isAgentSurface`) plutôt que
  `tenant.user_id === user.id` : la piste et la mesure désignent cette voie, sans lecture neuve.
- Ablation : condition retirée → 4 rouges sur 5 ; rétablie → 5/5, et les 120 tests de
  `components/leases/__tests__/` verts.
