---
id: TCK-2134
title: "Le panneau de signature d'un bail garde le « pour le compte de » et ne rend jamais un nom vide"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-220--noms-de-comptes-rendus-par-le-front-sans-repli-face-aux-comptes-créés-par-téléphone"
tags: [api, front, baux, signature, pistes]
---

## Contexte

Réf : **P220.02** du fichier de pistes, `retenu · autonome` (A1 : le texte du mandat et le repli
`—` existent déjà, ADR-0042). `LeaseResource` rendait `signer_name` et `on_behalf_of_name` par
`getFullNameAttribute()`, soit `''` pour un compte créé par téléphone. `LeaseSignaturePanel`
choisissait le texte du mandat sur la vérité de `on_behalf_of_name` et repliait par `??` : un
bailleur sans nom faisait disparaître le « pour le compte de », et un signataire sans nom donnait
« Signé par  le … ».

## Objectif utilisateur

La preuve de signature affichée dit toujours qui a signé, et pour le compte de qui.

## Contrat de données

`signatures[].signer_name` et `signatures[].on_behalf_of_name` : nom par `nameWithoutContact()`
(prénom et nom, puis `username`, puis `—`) ; `on_behalf_of_name` reste `null` sans mandat.

## Delta à produire

- [x] `LeaseResource` : les deux noms par `nameWithoutContact()`.
- [x] `LeaseSignaturePanel` : mandat choisi sur `on_behalf_of_name != null`, noms repliés par `|| '—'`.
- [x] Tests : `LeaseSignatureTest` (signataire et bailleur sans nom → `—`),
  `LeaseSignaturePanel.test.tsx` (noms `''` → « Signé par — le », « pour le compte de — »).

## Critères d'acceptation

- [x] AC1 — une signature d'un agent sans nom pour un bailleur sans nom rend `signer_name = "—"` et
  `on_behalf_of_name = "—"`.
- [x] AC2 — le panneau, avec `on_behalf_of_name: ''`, garde « pour le compte de ».

## Hors périmètre

- Les autres écrans de bail qui nomment le compte courant (P220.08, à valider).

## Notes d'implémentation

- Avant correctif, le test PHP rendait `''` pour `signer_name` ; le test Vitest rougissait.
- Ablation front : la condition remise à `signature.on_behalf_of_name` (vérité) → le cas neuf rougit.
