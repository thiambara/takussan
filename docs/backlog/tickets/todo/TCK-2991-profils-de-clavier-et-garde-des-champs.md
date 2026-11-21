---
id: TCK-2991
title: Les profils de clavier, la prop des primitives et la garde des champs
status: todo
phase: P2
family: front
estimate: M
wave: null
created: 2026-11-21
updated: 2026-11-21
depends_on: []
blocks: [TCK-2992, TCK-2993, TCK-2994]
spec_refs:
  features: []
  models: []
tags: [front, mobile, formulaires, clavier, adr-0135]
---

## Objectif utilisateur

Aucun champ neuf ne peut plus ouvrir le mauvais clavier ni arriver sans placeholder : la CI le refuse.

## Contrat de données

Aucun.

## Direction UX / Artistique

ADR-0135 § 1 à § 4. La table des profils reprend la maquette `playground/maquettes/ecran/profils.ts` validée par
le porteur, complétée des profils `nom`, `decimal`, `url`, `mot-de-passe` et `nouveau-mot-de-passe`.

## Delta

- [ ] `src/lib/clavier.ts` : `PROFILS`, `profil(nom)`, `NomDuProfil` ; `data-profil` posé.
- [ ] `Input` et `Textarea` prennent `profil` ; les valeurs du profil passent AVANT les props de l'appelant
      (`autoComplete` et `enterKeyHint` restent surchargeables).
- [ ] `FormInput` et `FormTextarea` transmettent `profil` ; `PhoneInput` pose `telephone`, `FormAmountInput`
      pose `montant`.
- [ ] `scripts/check-champs.mjs` (`npm run check:champs`) : relevé par fichier des champs sans profil, sans
      placeholder, en `type="number"`, et des réglages de clavier posés à côté d'un profil ; base exacte
      `scripts/champs-baseline.json`, `--update`, `--report`. Branchée dans le job `statique` de `web-ci.yml`.

## Critères d'acceptation

- [ ] AC1 — Chaque profil rend exactement les attributs de la table de l'ADR (test de la table).
- [ ] AC2 — Un champ neuf sans profil, sans placeholder ou en `type="number"` fait rougir la garde ; un compte
      qui descend aussi, tant que la base n'est pas réécrite (tests de la garde sur des fixtures, vérifiés par
      ablation).
- [ ] AC3 — Un `profil` passé à `FormInput` atteint l'`<input>` rendu ; un `PhoneInput` porte `telephone`.
