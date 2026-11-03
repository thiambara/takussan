---
id: TCK-1453
title: "Le dossier KYC se dit valable jusqu'à la veille de son échéance"
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
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-163--bornes-de-fin-saisies-en-date-seule-et-rangées-dans-une-colonne-datetime"
tags: [front, kyc, pistes]
---

## Objectif utilisateur

La veille de l'échéance de son dossier KYC, l'agence lit le vrai dernier jour de validité, et le
lendemain ne la surprend plus d'une « Expirée ».

## Contexte

Réf : **P163.02** du fichier de pistes, `validé (délégué)` (critère V7 cité par le classement,
accordé).

Mesuré avant correctif sur `58c404ecf` : `KycEcheance kind="dossier"`, échéance au
`2026-10-25T00:00:00Z`, rend « Vérification valable jusqu'au 25 oct. 2026 », alors que le dossier
échoit le 25 à 00:00 et s'affiche « Échue le 25 » ce jour-là.

## Décision du porteur (déléguée)

> garder « Vérification valable jusqu'au {date} » et y passer la veille de l'échéance du dossier (états `soon` et `valid` de `KycEcheance kind="dossier"`), sans changer la règle d'expiration ni aucun texte ; test : pour une échéance au 25, le rendu annonce une validité jusqu'au 24

## Hypothèses (mode sans humain)

- La veille se calcule sur l'instant d'échéance moins 24 h, rendu dans le fuseau figé de
  l'application (`Africa/Dakar`, sans heure d'été) : l'échéance que l'API émet est minuit.

## Delta à produire

- [x] `veilleEcheance()` dans `@/lib/kyc-echeance`.
- [x] `KycEcheance` : `dossierValidUntil` reçoit la veille ; `expiredOn` et `expiresOn` gardent
  la date d'échéance.
- [x] Test : `KycEcheance.veille.test.tsx` (échéance lointaine et proche au 25 → « jusqu'au 24 »,
  le 25 → « Échue le 25 », pièce → « Expire le 25 »).

## Critères d'acceptation

- [x] AC1 — Pour une échéance au 25, le dossier se dit valable jusqu'au 24 (états `valid` et
  `soon`).
- [x] AC2 — La règle d'expiration et les textes ne changent pas : le 25 rend « Échue le 25 ».

## Notes d'implémentation

- Ablation : `KycEcheance.tsx` rendu à son état antérieur → 2 rouges (« jusqu'au 25 ») ; remis →
  4 verts.
