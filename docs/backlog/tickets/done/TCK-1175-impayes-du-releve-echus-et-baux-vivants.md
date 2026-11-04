---
id: TCK-1175
title: "Relevé du bailleur : « Impayés de la période » ne compte que les loyers échus des baux non supprimés"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#15-leasepayment-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-93--indicateurs-des-tableaux-de-bord-et-du-relevé--valeurs-fausses-sur-des-données-réelles"
tags: [back, payouts, pistes]
---

## Contexte

Réf : **P93.02** du fichier de pistes, `validé` (V1 accordé).

`OwnerStatementService::unpaid` prenait toute échéance due dans la période, sans borne au jour
courant, et sans filtrer `leases.deleted_at` : le relevé du mois en cours (et l'attestation
annuelle) imprimait en « Impayés de la période » des loyers pas encore échus et ceux d'un bail
supprimé, là où `PortfolioMetrics::overdue` ne les compte pas.

## Décision du porteur

validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

**Choix de l'implémenteur.** La piste est d'une seule voie : borner l'échéance à `< aujourd'hui` en
plus de la période, filtrer `leases.deleted_at`, en lisant `CollectedPayments::leaseOwed()`.
`leaseOwed()` porte les mêmes statuts (`pending`, `partially_paid`, `late`) que le filtre d'avant ;
les types restent ceux du relevé (`PayoutCalculator::LEASE_TYPES` : loyer, charges, pénalité,
régularisation), pour ne rien changer d'autre que les deux bornes.

## Objectif utilisateur

Le relevé du bailleur n'annonce en impayé que ce qui est échu et dû sur un bail existant.

## Delta à produire

- [x] `OwnerStatementService::unpaid` : `leaseOwed()`, `leases.deleted_at IS NULL`, `due_date < today`.
- [x] Test dans `tests/Feature/Api/OwnerStatementTest.php`.

## Critères d'acceptation

- [x] AC1 — Au 2026-07-03, un loyer de 30 000 dû le 2 juillet, un de 100 000 dû le 25 juillet, et un
      de 70 000 dû le 1ᵉʳ juillet sur un bail supprimé : `unpaid` du relevé de 2026-07 vaut
      `{count: 1, amount: 30000}`.
- [x] AC2 — Les tests existants du relevé (mois, année, avis mensuel) restent verts.

## Hors périmètre

- Le libellé « Impayés de la période » et la mise en page du PDF.

## Notes d'implémentation

- Ablation : `OwnerStatementService.php` rendu à `HEAD` → rouge (`count` 3 au lieu de 1) ; remis →
  5/5 sur `OwnerStatementTest`.
