---
id: TCK-2525
title: Mise en avant d'une agence dans l'annuaire, achetée en crédits par l'agence
status: todo
phase: P1
family: full
estimate: M
wave: 85
created: 2026-11-09
updated: 2026-11-09
depends_on: [TCK-2520]
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md#124-agencyspotlight-"
tags: [back, front, credits, boost, directory]
---

## Objectif utilisateur

Une agence achète elle-même, avec ses crédits, la vitrine de l'annuaire d'une ville pour une période, sans passer par l'équipe Takussan.

## Contrat de données

Prolonge TCK-2520, qui livre la place **offerte** par la plateforme (table `agency_spotlights`, unicité par ville et période, `spotlight` dans l'annuaire public).

1. **Avant tout code : un amendement d'[ADR-0061](../../../adr/0061-credits-d-espace-et-boost-des-annonces.md)** qui étend la mise en avant d'un bien à une agence — prix et durée de la place (réglages de la plateforme, à côté de ceux du boost), ville, file d'attente ou refus quand la place est prise, remboursement quand la place se perd (agence suspendue), et ce qu'il advient d'une place offerte qui chevauche.
2. Achat par l'agence (capacité de mise en avant du catalogue des capacités, TCK-633 lot F) : débit du portefeuille de l'espace dans la même transaction que la création de la place ; refus lisible si les crédits manquent ou si la place est prise sur la période.
3. Une place achetée porte son origine (`granted_by_id` nul, référence au mouvement de crédits) ; les statistiques des boosts du super-admin la comptent.

## Direction UX / Artistique

- Dans la console de l'agence, à côté des boosts de biens : « Mettre l'agence en avant » — ville, période, prix en crédits, solde après achat.
- Aucune maquette dédiée : la place publique est celle de TCK-2521 (`/fr/playground/maquettes?p=annuaire&a=d`).

## Contraintes strictes (métier)

- Une seule vitrine par ville et par instant, achetée ou offerte (la contrainte de TCK-2520 tient).
- Aucun débit sans place créée, aucune place sans débit (même transaction).
- La place ne change pas l'ordre de l'annuaire (décision 1a du 2026-11-09).

## Delta à produire

- [ ] Amendement d'ADR-0061, accepté par le porteur.
- [ ] Spec : ligne de `docs/features.md` § 2.9 et § 1.12 mise à jour, colonnes de `agency_spotlights` si l'amendement en ajoute.
- [ ] Achat (API) + débit + refus.
- [ ] Écran d'achat dans la console de l'agence.
- [ ] Tests (débit et place atomiques, place prise, crédits insuffisants, statistiques).

## Critères d'acceptation

- [ ] AC1 — Un achat qui échoue sur la contrainte de place ne débite rien.
- [ ] AC2 — Deux achats simultanés de la même place : un seul réussit, un seul débit.
- [ ] AC3 — Crédits insuffisants : refus avant toute écriture, message lisible.

## Hors périmètre

- La place offerte et son affichage (TCK-2520, TCK-2521).

## Notes d'implémentation

_(à remplir par implementing-specs)_
