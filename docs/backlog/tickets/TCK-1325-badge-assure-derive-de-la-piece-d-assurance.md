---
id: TCK-1325
title: "Badge « Assuré » au carnet et à l'attribution, dérivé de la pièce d'assurance vivante ; `has_insurance` n'est plus écrit"
status: done
phase: P1
family: full
estimate: M
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#37-serviceproviderprofile-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-117--clés-de-metadata-des-profils-écrites-par-les-assistants"
tags: [api, web, prestataire, carnet, maintenance, pistes]
---

## Contexte

Réf : **P117.06** du fichier de pistes, `validé` (V7 accordé).

Le téléversement d'une attestation d'assurance posait `metadata.has_insurance = true` « pour le
badge Assuré » (TCK-261), badge jamais construit ; le drapeau n'avait aucun lecteur et ne se
remettait jamais à faux.

## Décision du porteur

> porteur (2026-10-22) : construire le badge « Assuré » dans le carnet et à l'attribution, dérivé du `Document` d'assurance vivant, puis retirer `has_insurance`

## Objectif

`GET /api/agencies/{a}/service-providers` rend `insured`, vrai si le profil porte une pièce
d'assurance vivante ; le carnet et le bloc d'attribution affichent « Assuré » ; plus rien n'écrit
`has_insurance`.

## Delta à produire

- [x] `ServiceProviderProfile::liveInsuranceDocuments()` : `Document` de type `insurance`, non
      supprimé, `expiry_date` nulle ou à venir, fichier présent dans la collection `file`.
- [x] Carnet : `->withExists('liveInsuranceDocuments as insured')`.
- [x] `uploadKyc` n'écrit plus `metadata.has_insurance`.
- [x] Front : `insured` dans `ServiceProviderProfileSummary` ; badge dans la cellule du nom du
      carnet, dans les options et sous le choix du bloc d'attribution ; clés
      `serviceProviders.list.insured` et `maintenance.intervention.assignment.insured`.

## Critères d'acceptation

- [x] AC1 — Sans pièce → `insured: false` ; pièce téléversée → `true` ; expirée ou supprimée →
      `false`.
- [x] AC2 — Une pièce `cni`, ou une pièce `insurance` sans fichier, ne vaut pas assurance.
- [x] AC3 — Le téléversement n'écrit plus `has_insurance`.
- [x] AC4 — Le carnet et le bloc d'attribution n'affichent « Assuré » que pour `insured: true`.

## Hypothèses

- « Vivant » : non supprimé, non expiré, fichier présent. La vérification par l'agence
  (`is_verified`) n'est pas exigée : rien d'écrit ne la demande pour ce badge.

## Hors périmètre

- Les `has_insurance` déjà écrits en base restent (les retirer réécrit des données, V4) ; ils
  n'ont aucun lecteur et le carnet ne les rend pas (`METADATA_KEYS`).
- Montrer `visit_fee` et `hourly_rate_min` à l'agence : la Piste le propose, la décision non.

## Notes d'implémentation

- Ablation API : `withExists` retiré → 2 rouges dans `ServiceProviderInsuredBadgeTest` ; remis →
  verts. `ServiceProviderOnboardingTest` (assertion `has_insurance` inversée),
  `ServiceProviderDirectoryProjectionTest`, `ServiceProviderDirectoryFilterTest`,
  `IncludedUserProjectionTest`, `InviteServiceProviderTest` verts.
- Ablation front : composants d'avant remis → `ServiceProvidersList.assure` et
  `MaintenanceAssignmentBlock` (cas assuré) rouges ; remis → verts.
- Le `Badge` n'a pas de variante `success` : `outline`.
- `wo` : les clés neuves portent le texte français (wolof en pause).
