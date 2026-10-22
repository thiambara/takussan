---
id: TCK-1473
title: "Une date OFX débordante est sautée et comptée, plus décalée"
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
    - "docs/features.md#15-transactions--paiements"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-157--lignes-de-relevé-importées-face-au-rapprochement"
tags: [back, rapprochement, ofx, pistes]
---

## Contexte

Réf : **P157.02** du fichier de pistes, `retenu · autonome` (A1).

`CsvDriver` relit la date dans son format et saute la ligne si elle ne redonne pas la chaîne
d'origine (TCK-593, `test_une_date_debordante_est_sautee_et_non_decalee`). `OfxDriver` appelle
`createFromFormat('Ymd', …)` et ne teste que `false` : `<DTPOSTED>20261332` entrait datée du
2027-02-01, et la date décalée entrait dans `period_end` et la fenêtre du matcher.

## Contrat de données

- Une `DTPOSTED` dont les 8 premiers caractères, relus en `Ymd`, ne se redonnent pas : la
  transaction est sautée et comptée (`tally->skip()`), comme au CSV.
- Le message de l'exception ne porte plus la date (même règle que `CsvDriver` : aucune valeur du
  relevé dans un journal).

## Delta à produire

- [x] Relecture `format('Ymd') !== $dateStr` dans `OfxDriver::parseBlock`.
- [x] `test_une_date_ofx_debordante_est_sautee_et_non_decalee` dans `StatementParserTest`.

## Critères d'acceptation

- [x] AC1 — `20261332` et `20260230` : sautées, `skipped = 2`.
- [x] AC2 — `20260415120000` : lue au 2026-04-15.

## Hors périmètre

- Le montant illisible ou à virgule (P157.03, au porteur).

## Notes d'implémentation

- Ablation : condition ramenée à `! $postedAt` → 1 rouge (3 lignes lues au lieu d'une), remise →
  12/12 verts.
