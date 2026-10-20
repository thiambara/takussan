---
id: TCK-1003
title: "L'approbation d'une demande de passage exige un dossier KYC vérifié, et la revue le dit"
status: done
phase: P2
family: full
estimate: M
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#49-agencyupgraderequest-"
    - "docs/models-spec.md#42-kycdossier-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-49--passage-dune-agence-individual-à-standard"
tags: [api, front, agency-upgrade, kyc, platform-payout, pistes]
---

## Contexte

Réf : **P49.02** du fichier de pistes, `validé` par le porteur. Après la bascule `individual →
standard`, `PlatformPayoutService::approve` refuse en `422 platform_payout.agency_unverified` les
reversements de la plateforme à une agence `standard` dont `is_verified` est faux (ADR-0039 § 5).
La bascule ne pose pas `is_verified` : seule la vérification du dossier KYC de l'agence
(`KycWorkflowService::verify`) l'allume. L'argent déjà clôturé gelait donc dès l'approbation,
sans que rien ne le dise au super-admin qui approuvait (mesuré par le mesureur : approbation
`200`, puis reversement `422 platform_payout.agency_unverified`).

## Décision du porteur

> validé — la revue de la demande de passage vaut vérification KYC : son approbation alimente le dossier KYC de l'agence avec les pièces de la demande et le marque vérifié, si la demande porte les pièces que le dossier exige ; si elle ne les porte pas, exiger un dossier KYC vérifié avant d'approuver la demande, et le dire dans la revue ; un test de bout en bout bascule → approbation d'un reversement, qui écrit le comportement retenu (porteur, 2026-10-19)

## Objectif

Le super-admin n'approuve un passage en professionnelle que pour une agence dont le dossier KYC
est vérifié, et il le voit dans la revue avant d'agir : l'agence passée `standard` reste payable.

## Hypothèses (mode sans humain)

- **La demande ne porte pas les pièces que le dossier exige**, et c'est donc la seconde branche de
  la décision qui s'applique, toujours. Lu : `KycWorkflowService::AGENCY_REQUIRED_DOCUMENTS` =
  `rccm`, `ninea`, `director_id` (des pièces téléversées, la dernière avec échéance) ; la demande
  (`AgencyUpgradeRequestService::submit`) ne porte que des valeurs saisies (`rc`, `ninea`) et un
  seul fichier, les statuts (`Document` de type `other`), ni RCCM ni pièce d'identité du
  dirigeant. La première branche (alimenter le dossier) n'a donc aucun cas où s'appliquer et n'est
  pas codée.
- « Dossier KYC vérifié » se lit `agency.kycDossier.status = verified`, comme
  `AgencyModerationController::verify`. `KycWorkflowService::verify` pose en même temps
  `is_verified`, que lit le reversement.
- « Le dire dans la revue » : le détail de la demande rend `agency.kyc_status`, et la page de revue
  affiche un avertissement, avec un lien vers la fiche de l'agence dans la console (où se revoit
  son dossier KYC), et désactive « Approuver ». Le refus de l'API (`422
  agency_upgrade.kyc_not_verified`, message traduit) couvre tout autre appelant.
- Texte `wo` : le français tel quel (wolof en pause).

## Delta à produire

- [x] `AgencyUpgradeReviewService::approve` : `422 agency_upgrade.kyc_not_verified` tant que le
      dossier KYC de l'agence n'est pas `verified`, avant toute écriture.
- [x] `lang/{fr,en,wo}/errors.php` : `agency_upgrade.kyc_not_verified`.
- [x] `GET /api/admin/agency-upgrade-requests/{id}` : `agency.kyc_status`.
- [x] Page `/super-admin/agency-upgrade-requests/[id]` : avertissement et « Approuver » désactivé
      sans dossier vérifié ; clés `decision.kycNotVerified`, `decision.openKyc`.
- [x] Tests : `AgencyUpgradeRequestReviewTest` (refus sans dossier ou dossier soumis, champ du
      détail, bout en bout bascule → reversement) ; `kyc-non-verifie.tck-1003.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Sans dossier KYC, ou avec un dossier `submitted` : approbation → `422`, code
      `agency_upgrade.kyc_not_verified` ; la demande reste `pending`, l'agence `individual` ; ni
      événement ni notification.
- [x] AC2 — Bout en bout : agence `individual` non vérifiée avec un `PlatformPayout` `pending` ;
      approbation refusée (`422`) ; dossier KYC déposé, soumis et vérifié par
      `KycWorkflowService` ; approbation → `200`, agence `standard` et `is_verified` ;
      `POST /api/admin/payouts/{id}/approve` → `200`, `approved`.
- [x] AC3 — Le détail rend `agency.kyc_status` (`verified`, ou `null` sans dossier).
- [x] AC4 — La revue avertit et désactive « Approuver » quand `kyc_status` n'est pas `verified` ;
      « Rejeter » reste actif ; rien ne s'affiche quand il l'est.

## Hors périmètre

- La page de demande côté agence (`/app/settings/agency/upgrade`) ne dit pas encore à l'admin
  d'agence que son dossier KYC doit être vérifié avant la revue : la décision ne vise que la revue.
- La reprise des statuts de la demande dans le dossier KYC (reste de P49.05) : les statuts ne sont
  aucune des trois pièces que le dossier exige.

## Notes d'implémentation

- Avant : `test_approving_a_request_without_a_verified_kyc_dossier_returns_422_and_stays_pending`
  et le bout en bout → `200` au lieu de `422` ; le champ du détail → `null` au lieu de
  `verified` (3 rouges sur 15).
- Ablation : l'appel à `assertKycVerified` retiré → les 2 mêmes rouges ; `kyc_status` retiré du
  contrôleur → le test du détail rouge ; `kycVerified` forcé à vrai dans la page → 2 rouges sur 3 ;
  tout remis → verts.
- Les aides `pendingRequest` (`AgencyUpgradeRequestReviewTest`) et `pendingRequestForAgency`
  (`AgencyKindFlipTest`) posent désormais un dossier vérifié par défaut, et
  `AgencyUpgradeRequestEncryptionTest` en pose un : sans lui, six tests qui approuvent rougissent.
  ⚠ Un test d'une autre branche qui approuve une demande par une fixture qui ne passe pas par ces
  aides rougira de même.
