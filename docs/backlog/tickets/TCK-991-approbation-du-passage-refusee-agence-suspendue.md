---
id: TCK-991
title: "L'approbation d'une demande de passage est refusée tant que l'agence est suspendue"
status: done
phase: P2
family: bug
estimate: S
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
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-49--passage-dune-agence-individual-à-standard"
tags: [api, agency-upgrade, moderation, pistes]
---

## Contexte

Réf : **P49.05** du fichier de pistes, `validé` par le porteur. `AgencyUpgradeReviewService::approve`
ne regarde que le statut de la demande (`assertPending`) ; ni lui ni `AgencyKindFlipService::flip`
ne lisent `agencies.status`. Une agence suspendue entre la demande et la revue passe donc en
`standard` (mesuré par le mesureur : `200`, puis `kind=standard`, `status=suspended`).

## Décision du porteur

> validé — refuser en 422 l'approbation d'une demande dont l'agence est `suspended`, et elle seule (`inactive` reste approuvable, ADR-0048), la demande restant `pending` ; réutiliser la pièce de la demande dans le dossier KYC, suivant P49.02 (porteur, 2026-10-19, sur la recommandation du délégué)

## Reste à faire

- Réutiliser la pièce de la demande dans le dossier KYC, suivant P49.02 : P49.02 n'est pas
  implémentée (hors de ce lot), et ce point en dépend.

## Objectif

Une demande de passage dont l'agence est `suspended` ne s'approuve pas ; elle reste `pending`,
approuvable une fois la suspension levée, ou rejetable.

## Delta à produire

- [x] `AgencyUpgradeReviewService::approve` : `422 agency.suspended` quand l'agence de la demande
      est `suspended`, avant toute écriture.
- [x] Tests : `AgencyUpgradeRequestReviewTest` (agence `suspended` refusée, agence `inactive`
      approuvée).

## Critères d'acceptation

- [x] AC1 — Agence `suspended` : `POST /api/admin/agency-upgrade-requests/{id}/approve` → `422`,
      code `agency.suspended` ; la demande reste `pending`, l'agence `individual` ; ni événement,
      ni notification.
- [x] AC2 — Agence `inactive` : l'approbation passe (`200`), l'agence devient `standard`.
- [x] AC3 — Le rejet d'une demande d'une agence suspendue reste possible (inchangé, non gardé ici).

## Hypothèses (mode sans humain)

- Le code d'erreur réutilise `agency.suspended`, déjà traduit dans `lang/{fr,en,wo}/errors.php`
  (« Cette agence est suspendue : … aucune modification n'est possible. ») : aucun texte neuf.
  Le middleware `EnsureAgencyWritable` le rend en `423` ; la décision demande `422`.
- Le refus vit dans le service, comme `assertPending`, pour couvrir aussi un appelant direct.

## Hors périmètre

- La seconde moitié de la décision (pièce de la demande dans le dossier KYC) : voir « Reste à
  faire ».

## Notes d'implémentation

- Avant : agence `suspended` → `200`, demande `approved`, agence `standard`.
- Ablation : la condition neutralisée → AC1 rouge seul (`200` au lieu de `422`), AC2 vert ;
  remise → 14 verts.
- ⚠ `$request->agency()->value('status')` rend l'enum casté, pas la chaîne : la première écriture,
  qui comparait à `AgencyStatus::Suspended->value`, laissait le test rouge.
