---
id: TCK-1716
title: "Une fiche client ou un garant ne se suppriment pas sous un bail en préavis : une seule définition du bail ouvert"
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
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#7-customer"
    - "docs/models-spec.md#14-lease-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-162--compteurs-et-sélecteurs--en-cours--écrits-par-une-liste-de-statuts-à-la-main"
tags: [back, crm, leases, guarantors, pistes]
---

## Contexte

Réf : **P162.03** du fichier de pistes, `validé` (critère V3 accordé). Les refus
`customer.attached_to_open_lease` et `guarantor.attached_to_open_lease` ne regardent que
`pending_signature` et `active` ; la suppression de compte juge par
`ACTIVE_TENANT_LEASE_STATUSES + pending_signature`, préavis compris. Une fiche ou un garant se
suppriment donc sous un bail `terminating`, dont le loyer reste dû.

## Décision du porteur

validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

La piste n'offre qu'une voie : juger les deux refus par la constante de P162.02 plus
`PendingSignature`, celle d'`AccountDeletionService::openLeaseStatuses`, remontée sur le modèle.

## Delta à produire

- [x] `Lease::OPEN_STATUSES = [...ONGOING_STATUSES, pending_signature]` (`ONGOING_STATUSES` : TCK-1714).
- [x] `CustomerController::destroy`, `GuarantorController::destroy` et
  `AccountDeletionService::openLeaseStatuses()` la lisent.
- [x] `CustomerSousBailTest` et `GuarantorTest` étendus à `terminating`.

## Critères d'acceptation

- [x] AC1 — fiche titulaire d'un bail `terminating` → 422 `customer.attached_to_open_lease`,
  fiche intacte.
- [x] AC2 — garant d'un bail `terminating`, par le pivot comme par la colonne → 422
  `guarantor.attached_to_open_lease`.
- [x] AC3 — la suppression de compte garde les mêmes statuts qu'avant
  (`AccountDeletionRequestTest` vert).

## Hors périmètre

- Les messages des deux refus disent « en attente de signature ou en cours » : le préavis est un
  bail en cours, ils restent justes.

## Notes d'implémentation

- Ablation : les deux contrôleurs remis à `43c553036` → 1 rouge par classe ; correctif remis →
  2/2 et 9/9 verts.
