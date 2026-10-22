---
id: TCK-1451
title: "L'aide du mot de passe dit la lettre et le chiffre exigés, et l'anglais écrit « MB »"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#28-internationalisation--préférences"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-159--exemples-et-formats-montrés-à-la-saisie-face-à-la-règle-qui-jugera-la-valeur"
tags: [front, i18n, auth, pistes]
---

## Objectif utilisateur

À l'inscription et à la réinitialisation, l'aide du mot de passe annonce ce que l'API exigera
(8 caractères, une lettre, un chiffre) ; en anglais, les tailles de fichier s'écrivent en « MB ».

## Contexte

Réf : **P159.04** du fichier de pistes, `retenu · autonome` (A4 : i18n sans texte de produit
neuf, les placeholders reprennent `invitationAccept.passwordHint`).

Mesuré avant correctif sur `58c404ecf` : `auth.register.passwordPlaceholder` et
`auth.resetPassword.passwordPlaceholder` disent « Au moins 8 caractères » alors que
`Password::defaults()` exige `letters()->numbers()` ; `en.json` porte six textes en « Mo ».

## Hypothèses (mode sans humain)

- Le texte de `invitationAccept.passwordHint` est repris tel quel, point final compris, en `fr`
  et `en`. Le `wo` reste tel quel (wolof en pause).
- La clé `documents.upload.size_mo` garde son nom : seule sa valeur anglaise change.

## Delta à produire

- [x] `fr.json`, `en.json` : les deux placeholders reprennent `invitationAccept.passwordHint`.
- [x] `en.json` : « Mo » → « MB » dans les six textes de taille.
- [x] Tests : `auth-form-ux.test.tsx` (placeholder de la réinitialisation et de l'inscription),
  `messages.test.ts` (aucun texte `en` n'écrit une taille en « Mo »).

## Critères d'acceptation

- [x] AC1 — La page de réinitialisation montre l'exigence de lettre et de chiffre.
- [x] AC2 — Aucun texte anglais n'écrit une taille en « Mo ».

## Notes d'implémentation

- Ablation : `fr.json` et `en.json` rendus à leur état antérieur → 2 rouges ; remis → 74 verts.
