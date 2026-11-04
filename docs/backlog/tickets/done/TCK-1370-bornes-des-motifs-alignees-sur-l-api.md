---
id: TCK-1370
title: "Les motifs de rejet de devis et d'annulation de reversement suivent la borne de l'API"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-095]
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#deux-motifs-acceptés-par-le-front-puis-refusés-en-422-par-lapi"
tags: [front, maintenance, reversements, i18n, pistes]
---

## Objectif utilisateur

Un motif trop court est refusé par le formulaire, avec le bon message (rejet de devis) ou un
bouton désactivé (annulation de reversement), au lieu de partir puis de revenir en 422.

## Contexte

Réf : **P114.03** du fichier de pistes, `validé (délégué)` (critère V7 cité par le classement,
accordé).

Mesuré avant correctif (tests de garde ci-dessous, rouges sur `45fd976b2`) :

- `QuoteRejectionModal` : `z.string().min(5, t('reason_min'))` contre `min:10` de
  `RejectQuoteRequest` → un motif de 9 caractères passe le formulaire.
- `PayoutDetailPanel` : `disabled={!reason || …}` contre `min:3` de `CancelPlatformPayoutRequest`
  → « ab » laisse « Annuler » actif.

## Décision du porteur (déléguée)

> aligner le front sur l'API : `QuoteRejectionModal` exige au moins 10 caractères (TCK-095), avec une clé de message neuve qui dit 10 en fr et en, et en `wo` le texte français tel quel, l'ancienne `reason_min` retirée des trois langues ; `PayoutDetailPanel` désactive « Annuler » tant que le motif, espaces retirés, compte moins de 3 caractères, sans texte neuf ; un test du composant à la borne garde chacun des deux

## Hypothèses (mode sans humain)

- Clé neuve : `maintenance.quote.reject.reason_min_length`. Le `wo` porte le texte français tel
  quel (wolof en pause depuis le 2026-10-16) ; l'ancienne valeur wolof part avec `reason_min`.
- « Espaces retirés » : `trim()`, comme le middleware `TrimStrings` de Laravel avant `min:3`.

## Delta à produire

- [x] `QuoteRejectionModal` : `min(10, t('reason_min_length'))`.
- [x] `fr.json`, `en.json`, `wo.json` : `reason_min` remplacée par `reason_min_length`.
- [x] `PayoutDetailPanel` : « Annuler » désactivé si `reason.trim().length < 3`.
- [x] Tests : `QuoteRejectionModal.borne.test.tsx` (9 refusé avec le message, 10 envoyé),
  `PayoutDetailPanel.motif.test.tsx` (`ab` et `  ab ` désactivés, `abc` actif).

## Critères d'acceptation

- [x] AC1 — rejet de devis, 9 caractères : message « au moins 10 caractères », rien d'envoyé.
- [x] AC2 — rejet de devis, 10 caractères : envoyé.
- [x] AC3 — annulation de reversement : désactivée sous 3 caractères utiles, active à 3.

## Hors périmètre

- Les règles de l'API, inchangées.

## Notes d'implémentation

- Ablation : les deux composants remis à `45fd976b2` → 3 rouges sur 5 (les cas qui doivent
  refuser) ; remis → 5 verts, et `PayoutDetailPanel.double-facteur.test.tsx` vert.
