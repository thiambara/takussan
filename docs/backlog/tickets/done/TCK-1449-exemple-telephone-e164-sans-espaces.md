---
id: TCK-1449
title: "Le message phone_e164 cite un exemple que ses règles acceptent"
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
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-159--exemples-et-formats-montrés-à-la-saisie-face-à-la-règle-qui-jugera-la-valeur"
tags: [back, i18n, validation, pistes]
---

## Objectif utilisateur

L'utilisateur qui recopie l'exemple du message d'erreur d'un téléphone obtient un numéro accepté.

## Contexte

Réf : **P159.03** du fichier de pistes, `retenu · autonome` (A1 : la forme attendue est écrite
par la règle elle-même, `PhoneNumber::E164_REGEX`).

Mesuré avant correctif sur `58c404ecf` : `validation.rules.phone_e164` dit « ex. +221 77 123 45
67 » (`fr`, `en`), et les cinq requêtes qui le rendent (`UpdateProfileRequest`,
`SecondaryPhoneRequest`, `ResendPhoneVerificationRequest`, `ReplacePropertyContactsRequest`,
`UpdateMeRequest`) n'acceptent que `+` suivi de chiffres.

## Hypothèses (mode sans humain)

- Le texte `wo` reste tel quel (wolof en pause depuis le 2026-10-16) : il cite encore la forme
  espacée.

## Delta à produire

- [x] `lang/fr/validation.php` et `lang/en/validation.php` : l'exemple devient `+221771234567`.
- [x] Test : `tests/Unit/Lang/ExempleTelephoneTest.php` extrait l'exemple du message `fr` et `en`
  et le juge par les trois regex des cinq requêtes et par `TelephoneJoignable::defaut()`.

## Critères d'acceptation

- [x] AC1 — L'exemple cité par le message, en `fr` et en `en`, passe chaque regex qui l'affiche
  et `TelephoneJoignable`.

## Notes d'implémentation

- Ablation : les deux fichiers `lang` rendus à leur état antérieur → 2 rouges ; remis → 2 verts.
