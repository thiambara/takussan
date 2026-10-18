---
id: TCK-824
title: "Boost : le dialogue d'achat lit les boosts du bien et dit ce que l'offre choisie fera au boost en place"
status: done
phase: P2
family: full
estimate: M
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-24--crédits-et-boost--idempotence-des-achats-remboursements-ce-que-voit-lespace"
tags: [back, front, boost, credits, pistes]
---

## Contexte

Réf : **P24.02** du fichier de pistes, `validé` (V7 accordé).

Le dialogue d'achat d'un boost (`BoostDialog`) ne lisait que le solde et le catalogue. Il proposait
les trois genres sans dire qu'un badge actif serait remplacé sans remboursement, qu'une Vedette en
cours serait prolongée, ni qu'une Remontée était encore en délai (ADR-0061 § 5). La lecture
`GET /api/properties/{property}/boosts` (TCK-633) n'avait aucun appelant.

## Décision du porteur

validé — lire GET …/boosts à l'ouverture et dire, pour l'offre choisie, le remplacement sans remboursement, la prolongation ou le délai de Remontée

## Objectif utilisateur

L'annonceur qui met un bien en avant sait, avant de confirmer, ce que son achat fera au boost déjà
en place.

## Contrat de données

- `GET /api/properties/{property}/boosts` rend en plus `bump_available_at` : la fin du délai de
  Remontée en cours (ISO 8601), `null` hors délai. Même règle que le refus `boost.bump_cooldown` de
  l'achat, extraite dans `BoostPurchaseService::bumpAvailableAt()`.

## Contraintes strictes (métier)

- ADR-0061 § 5 : un badge remplace le badge vivant sans remboursement ; une Vedette prolonge la
  Vedette vivante, depuis sa fin ou depuis maintenant si elle est échue sans être close ; une
  Vedette en pause gagne des jours sans date de fin ; une Remontée attend la fin de son délai.
- Le dialogue ne tire rien tant qu'il est fermé.

## Delta à produire

- [x] `BoostPurchaseService::bumpAvailableAt()`, employé par `bump()` et par `PropertyBoostController::index()`.
- [x] Front : `usePropertyBoosts` (clé sous `properties`, invalidée par l'achat), `effetAchat()`,
  l'annonce dans `BoostDialog` ; textes `boost.dialog.effect.*` en `fr` et `en`.
- [x] Tests : `PropertyBoostReadAheadTest` (3), `BoostDialog.test.tsx` (6 cas neufs).

## Critères d'acceptation

- [x] AC1 — Après une Remontée, la lecture rend la même date que le refus d'une seconde Remontée.
- [x] AC2 — Un badge choisi alors qu'un badge est actif dit qu'il le remplace, sans remboursement.
- [x] AC3 — Une Vedette choisie alors qu'une Vedette est active dit jusqu'à quand elle la prolonge.
- [x] AC4 — Sans boost en place, rien n'est annoncé.

## Hypothèses

- Le texte `wo` porte le texte français tel quel (wolof en pause depuis le 2026-10-16).
- Une erreur de lecture des boosts bloque le dialogue comme celle du solde ou du catalogue, avec le
  même « Réessayer » : la décision demande de lire à l'ouverture, et un achat sans l'annonce
  retomberait dans le défaut.
- L'annonce n'empêche pas la confirmation d'une Remontée en délai : l'API la refuse toujours en 422.

## Hors périmètre

- Le texte du refus `boost.bump_cooldown` (P24.06).

## Notes d'implémentation

- Ablation : `effet` forcé à `null` → 4 tests du dialogue rouges ; `bump_available_at` forcé à
  `null` → le test « après une remontée » rouge.
- Le dialogue fige `maintenant` à son montage (`useState(() => Date.now())`), pour garder un rendu
  pur (React Compiler).
