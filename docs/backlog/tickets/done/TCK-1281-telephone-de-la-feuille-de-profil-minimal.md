---
id: TCK-1281
title: "Feuille de profil minimal : le téléphone se saisit par `PhoneInput` et part en E.164"
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-125--téléphones-écrits-sans-normalisation-et-leurs-lecteurs"
tags: [web, profil, telephone, pistes]
---

## Contexte

Réfs : **P125.03** (`validé (délégué)`) et **P145.01** (`retenu · autonome`, A1), même cause et
même correctif.

La feuille de profil minimal du client (`CustomerMinimalProfileSheet`, complétion différée du
profil, `docs/features.md` § 2.1) saisit le téléphone dans un `Input` libre dont l'exemple est
`+221 77 000 00 00`, et envoie la frappe seulement `trim()`ée à `PATCH /api/me`. `UpdateMeRequest`
n'accepte que l'E.164 sans espace : la forme de l'exemple et la forme nationale rendent 422.

Mesuré avant correctif (`pre-dev` a2398e474, test de garde ci-dessous) : saisie `77 000 00 00` →
corps `{"phone":"77 000 00 00"}` ; saisie `+221 77 000 00 01` → `{"phone":"+221 77 000 00 01"}`.

## Décision du porteur (déléguée)

> saisir le numéro de la feuille de profil minimal par `PhoneInput`, comme les quatorze autres formulaires qui saisissent un téléphone (`SecondaryPhoneSection`, `CustomerForm`, les assistants d'onboarding), pour que la valeur envoyée à `PATCH /api/me` soit l'E.164 ; aucune normalisation silencieuse côté API ; reste : remonter l'erreur de champ du 422 sous le champ (texte et forme du message)

## Reste à faire

> remonter l'erreur de champ du 422 sous le champ (texte et forme du message)

Ce reste couvre aussi la seconde moitié de P145.01 (« rendre le message de validation du champ au
lieu d'un échec générique ») : le porteur l'a gardé pour lui sur P125.03, il n'est donc pas fait
sous P145.01 non plus.

## Objectif

Un client qui tape son numéro comme l'exemple, ou sous sa forme nationale, l'enregistre.

## Delta à produire

- [x] `CustomerMinimalProfileSheet` : le champ téléphone devient `<PhoneInput>` (indicatif
      `+221` affiché en préfixe, valeur composée en E.164), comme `SecondaryPhoneSection`.
- [x] La clé `customer.minimalProfile.phonePlaceholder` n'a plus de lecteur : retirée des trois
      dictionnaires (valeur identique dans les trois, `+221 77 000 00 00` ; aucun texte wolof
      touché).
- [x] Test : `MinimalProfileTriggerProvider.test.tsx`, saisies `77 000 00 00` et
      `+221 77 000 00 01` → corps `PATCH /api/me` en E.164.

## Critères d'acceptation

- [x] AC1 — Saisie `77 000 00 00` → `PATCH /api/me` reçoit `{"phone":"+221770000000"}`.
- [x] AC2 — Saisie `+221 77 000 00 01` → `{"phone":"+221770000001"}`.
- [x] AC3 — L'API n'est pas touchée (aucune normalisation silencieuse côté API).

## Hors périmètre

- Le message d'erreur de champ du 422 (reste ci-dessus).
- Le 403 de `PhoneChangeGuard` pour un numéro déjà vérifié (P145.01, déjà épinglé par
  `PhoneChangeProofTest`).

## Hypothèses

- `PhoneInput` ne prend pas d'exemple : aucun des quatorze formulaires qui l'emploient n'en passe,
  et `+221 77 000 00 00` derrière le préfixe `+221` doublerait l'indicatif. Son aide (« indicatif
  … ») tient lieu d'exemple.

## Notes d'implémentation

- Ablation : composant remis à sa version d'avant (`Input` libre) → les deux cas du test neuf
  rougissent (corps `+221 77 000 00 01` tel que tapé) ; remis → 6/6 verts.
