---
id: TCK-1475
title: "La devise d'une transaction OFX se lit par relevé de compte (`STMTRS`)"
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

Réf : **P157.08** du fichier de pistes, `validé (délégué)` (critère V7 accordé).

`OfxDriver` prenait le premier `<CURDEF>` du fichier pour toutes ses `<STMTTRN>` : un OFX à deux
comptes, `XOF` puis `EUR`, rendait deux lignes en `XOF` (mesuré par le mesureur), et une ligne en
euros pouvait s'apparier à un paiement en francs CFA.

## Décision du porteur (déléguée)

validé (délégué) — lire `CURDEF` par `STMTRS` : chaque transaction prend la devise du relevé de compte qui la contient, la devise de l'agence à défaut ; test : deux `STMTRS` en `XOF` puis `EUR` dans `StatementParserTest` ; reste : les lignes à montant nul et le `TRNTYPE` qui contredit le signe

## Reste à faire

les lignes à montant nul et le `TRNTYPE` qui contredit le signe

## Contrat de données

- Chaque `<STMTRS>…</STMTRS>` est lu à part ; ses transactions prennent son `CURDEF`, la devise de
  l'agence à défaut (`XOF` si l'agence n'en a pas, comme avant).
- Hypothèse : le relevé de carte `<CCSTMTRS>` porte son `CURDEF` de la même façon ; il est lu de
  même.
- Un fichier sans relevé de compte fermé se lit d'un seul tenant, comme avant (premier `CURDEF`).

## Delta à produire

- [x] `OfxDriver::parse` : transactions regroupées par `STMTRS`/`CCSTMTRS`, devise par groupe.
- [x] Deux tests dans `StatementParserTest`.

## Critères d'acceptation

- [x] AC1 — deux `STMTRS` en `XOF` puis `EUR` : lignes `XOF` puis `EUR`.
- [x] AC2 — un `STMTRS` sans `CURDEF` : ses lignes prennent la devise de l'agence.
- [x] AC3 — `sample.ofx` se lit comme avant (`test_ofx_driver_parses_sample_file` vert).

## Hors périmètre

- Le reste ci-dessus.

## Notes d'implémentation

- Piège : `(CC)?` puis `\1` ne s'apparie pas quand le groupe n'a rien pris (PCRE) ; le groupe
  s'écrit `(CC|)`.
- Ablation : `CURDEF` relu sur le fichier entier au lieu du compte → 2 rouges, remis → 14/14.
