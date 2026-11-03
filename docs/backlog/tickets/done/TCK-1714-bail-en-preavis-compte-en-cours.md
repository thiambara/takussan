---
id: TCK-1714
title: "Un bail en préavis (`terminating`) compte parmi les baux en cours chez le bailleur, l'agence et la plateforme"
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
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#14-lease-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-162--compteurs-et-sélecteurs--en-cours--écrits-par-une-liste-de-statuts-à-la-main"
tags: [back, dashboard, leases, reporting, pistes]
---

## Contexte

Réf : **P162.02** du fichier de pistes, `validé` (critère V1 accordé). `LeaseStatus::Terminating`
« reste effectivement actif (loyer dû) » jusqu'à la date d'effet, et le locataire le compte
(`HasProfiles::ACTIVE_TENANT_LEASE_STATUSES`) ; le bailleur, l'agence, `GET /api/agencies/{id}/stats`,
`agencies.active_leases_count` et l'instantané plateforme `leases_active` ne comptent que `active`.

## Décision du porteur

validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

La piste n'offre qu'une voie : une constante unique `Lease::ONGOING_STATUSES = [Active, Terminating]`,
que `ACTIVE_TENANT_LEASE_STATUSES` réutilise, lue par les six sites.

## Delta à produire

- [x] `Lease::ONGOING_STATUSES` ; `HasProfiles::ACTIVE_TENANT_LEASE_STATUSES` la reprend.
- [x] `DashboardOwnerService` (`leases.active`, `finance.expected_monthly`), `DashboardAgencyService`
  (`leases.active`), `AgencyStatsController` (`active_leases_count`), `LeaseObserver`
  (`agencies.active_leases_count`), `PlatformMetricsSnapshotter` (`leases_active`) la lisent.
- [x] `BauxEnPreavisComptesEnCoursTest` (neuf).

## Critères d'acceptation

- [x] AC1 — bailleur à un bail `active` de 50 000, un `terminating` de 100 000, un `terminated` :
  `leases.active = 2`, `expected_monthly = 150000`.
- [x] AC2 — agence aux trois mêmes statuts : tableau de bord et statistiques rendent 2.
- [x] AC3 — un bail qui passe d'`active` à `terminating` garde le compteur d'agence à 1, puis 0 à
  `terminated`.
- [x] AC4 — l'instantané plateforme compte 2 sur les trois statuts.

## Hors périmètre

- **La série historisée `leases_active` change à compter de ce ticket** (ce que la piste dit « à
  dire ») : les instantanés déjà écrits ne sont pas recalculés, et les KPI et alertes de seuil qui
  la lisent voient un saut le jour du déploiement.
- `agencies.active_leases_count` déjà écrit n'est pas recompté : il se corrige au prochain
  changement de statut d'un bail de l'agence. Un recomptage en masse serait une réécriture de
  données (V4).
- Le libellé « baux actifs » ne change pas.

## Notes d'implémentation

- Ablation : les six sites remis à `43c553036`, constante gardée → 4/4 rouges ; correctif remis →
  4/4 verts. `LeaseObserverTest`, `AgencyStatsTest`, `DashboardOwnerTest`, `DashboardAgencyTest`,
  `DashboardOwnerMetricsTest`, `PlatformRevenueMrrTest`, `DashboardTenantTest`,
  `AccountDeletionRequestTest` verts.
