---
id: TCK-2100
title: "La première échéance offerte à une pièce KYC est le lendemain du jour UTC de l'API"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: [TCK-2094]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-212--dates-calendaires-et--aujourdhui--calculés-au-navigateur-face-au-jour-utc-de-lapi"
tags: [front, kyc, dates, pistes]
---

## Contexte

Réf : **P212.04** du fichier de pistes, `retenu · autonome` (A1 : la première date recevable est
écrite par la règle de l'API, `UploadKycDocumentRequest` : `expires_at` `after:today`, en UTC).

`demainIso` (`kyc-echeance.ts`), `min` du champ d'échéance de `kyc-components.tsx`, rendait le
lendemain LOCAL : le soir à l'ouest d'UTC, c'était le jour même de l'API, refusé ; à l'est, le
premier jour recevable était grisé entre minuit local et minuit UTC.

## Delta à produire

- [x] `demainIso` rend `decalerJour(jourDeLApi(maintenant), 1)` (TCK-2094).
- [x] Test : `kyc-echeance.demain.p212-04.test.ts` (navigateur à New York).

## Critères d'acceptation

- [x] AC1 — À 01:00 Z le 25 octobre sous `America/New_York`, `demainIso` rend `2026-10-26`.

## Hors périmètre

- `etatEcheance`, qui juge aussi « aujourd'hui » en local face à `kyc:expire-dossiers` : écart
  d'affichage resté déduit par la mesure, laissé hors du correctif autonome.

## Notes d'implémentation

- Ablation : `kyc-echeance.ts` rendu à `pre-dev` → 1 test neuf rouge (« expected '2026-10-25' to
  be '2026-10-26' ») ; correctif remis → vert, et `kyc-echeance.test.ts` (10),
  `KycUploader.erreurs` et `KycUploader.pastille-tck-385` (16) verts.
