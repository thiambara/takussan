---
id: TCK-1351
title: "Profil : vider sa présentation l'efface (`bio` relayée dès que le formulaire la porte)"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-149--champs-vidés-dun-patch-partiel-lus-comme--garder-"
tags: [web, profil, pistes]
---

## Contexte

Réf : **P149.03** du fichier de pistes, `validé` (V3 accordé).

`updateProfileAction` lisait `(formData.get('bio') as string) || undefined` : une bio vidée
devenait `undefined`, `updateProfile` ne l'ajoutait pas au corps, et l'API (qui n'écrit que les
clés reçues, `AuthController.php:170`) gardait l'ancienne présentation.

## Décision du porteur

> porteur (2026-10-22) : relayer `bio` dès que le formulaire le porte (`formData.has('bio')`), chaîne vide comprise

## Delta à produire

- [x] `updateProfileAction` : `bio` posée dès que `formData` en porte une valeur texte, `''`
      compris ; absente du formulaire, elle reste hors du corps.

## Critères d'acceptation

- [x] AC1 — `bio=''` → le corps envoyé à `PUT /api/auth/profile` porte `bio` vide.
- [x] AC2 — `bio` saisie → relayée ; formulaire sans `bio` → clé absente.

## Hypothèses

- `typeof formData.get('bio') === 'string'` équivaut à `formData.has('bio')` pour un champ texte,
  sans relayer un fichier posté sous ce nom.
- L'API convertit `''` en `null` (`ConvertEmptyStringsToNull`) : aucun changement côté API.

## Notes d'implémentation

- Ablation : `|| undefined` remis → AC1 rouge ; remis → 3 verts (et les 3 de
  `auth.preuve-numero` restent verts).
