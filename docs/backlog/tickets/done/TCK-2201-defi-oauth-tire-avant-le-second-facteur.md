---
id: TCK-2201
title: "L'ouverture d'une session OAuth juge le blocage et tire le défi avant de vérifier le second facteur"
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
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-213--écritures-faites-avant-un-refus-4xx-hors-de-la-transaction-qui-porte-le-refus"
tags: [back, auth, 2fa, oauth, pistes]
---

## Objectif utilisateur

Un code de secours saisi sur un défi OAuth refusé (compte bloqué, défi déjà soldé par une double
soumission) reste valable.

## Contexte

Réf : **P213.04** du fichier de pistes, `validé`.

Décision du porteur : validation du porteur (2026-10-24) : `complete` juge `canOpenSession` avant `secondFactorHolds` et tire le défi (`pull`) avant de vérifier le facteur, remis avec `attempts + 1` sur un échec ; `maybeUpdateName` inchangé

Avant (lu, puis mesuré par `OAuthDefiAvantFacteurTest`, 2 rouges) : `OAuthSessionOpener::complete`
vérifie le facteur (`verifyRecoveryCode` retire le code et sauve) avant `cache->pull` et avant
`canOpenSession`.

## Hypothèses (mode sans humain)

- Le facteur faux remet le défi sous son échéance d'origine, `attempts + 1`, sauf à la cinquième
  tentative, où il reste oublié (la règle des 5 tentatives, inchangée).
- Le nom du jeton émis se lit sur le défi tiré (`pull`), et non sur la première lecture.

## Delta à produire

- [x] `complete` : `canOpenSession`, puis `pull`, puis `secondFactorHolds` ; défi remis sur un échec.
- [x] Test : `tests/Feature/Auth/TwoFactor/OAuthDefiAvantFacteurTest.php`.

## Critères d'acceptation

- [x] AC1 — Compte bloqué : 403, aucun jeton, code de secours toujours valable.
- [x] AC2 — Défi soldé entre la lecture et le tirage : 422, aucun jeton, code de secours valable.
- [x] AC3 — Facteur faux : 401, défi remis avec une tentative de plus ; à la cinquième, oublié.

## Notes d'implémentation

- **Ablation** : service remis à `HEAD` → 2 rouges sur 4 (les deux tests du défi remis passent
  aussi avant correctif : témoins) ; correctif remis → 4 verts.
- **Piège** : la course se rejoue par un `Repository` dont `pull` retire et rend `null`, comme le
  voit la seconde de deux soumissions concurrentes.
