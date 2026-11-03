---
id: TCK-1719
title: "Un montant OFX qui n'est pas un nombre fait sauter la ligne, comptée, au lieu d'être deviné"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md"
  models:
    - "docs/models-spec.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-157--lignes-de-relevé-importées-face-au-rapprochement"
tags: [back, accounting, reconciliation, ofx, pistes]
---

## Objectif utilisateur

À l'import d'un relevé OFX, une transaction dont le montant n'est pas lisible n'entre plus avec un
montant inventé (`abc` en crédit de 0, `12abc` en 12) : elle est sautée et comptée dans les lignes
sautées du relevé, comme au CSV depuis TCK-593.

## Contexte

Réf : **P157.03** du fichier de pistes, `validé` (critère V1 cité par le classement, accordé).

Mesuré avant correctif (test de garde ci-dessous, rouge sur `9f180a3ae`) : `OfxDriver::parseAmount()`
lit `abc` → 0, `1.234,56` → 1234,56 (séparateur deviné), `12abc` → 12, `150 000` à espace insécable
→ 150, sans aucune ligne comptée comme sautée.

## Décision du porteur

> validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

## Choix de l'implémenteur (voie la plus étroite)

- La `Piste` donne la règle (`^[+-]?\d+([.,]\d+)?$` après retrait des espaces, insécables compris)
  et laisse ouvert le sort de la virgule décimale. Retenue : **la virgule reste admise comme
  séparateur décimal**, comme le faisait déjà le pilote et comme l'écrit la règle de la `Piste`.
  L'autre voie (point seul) ferait sauter tout montant `7500,50` aujourd'hui lu juste, sur une norme
  non vérifiée (D-67).

## Reste à faire

- Le sort de la virgule décimale : `150,000` reste lu 150 (virgule décimale) tant que la norme OFX
  et des relevés réels ne sont pas vérifiés (D-67) ; au porteur.

## Delta à produire

- [x] `OfxDriver::parseAmount()` : retrait des espaces (U+0020, U+00A0, U+202F), règle de la `Piste`,
  sinon exception → ligne sautée et comptée par la boucle de `parse()`.
- [x] Test : `StatementParserTest::test_un_montant_ofx_non_numerique_est_saute_et_non_devine`.

## Critères d'acceptation

- [x] AC1 — `abc`, `1.234,56`, `12abc` : lignes sautées, `skipped = 3`.
- [x] AC2 — `150 000` (espace ASCII ou insécable) → 150 000 ; `-2500.50` → débit de 2 500,50 ;
  `7500,50` → 7 500,50.

## Notes d'implémentation

- Ablation : `OfxDriver.php` rendu à son état antérieur → 1 rouge (`TEXTE` 0, `DEUX-SEPARATEURS`
  1234,56, `RESTE` 12, `INSECABLE` 150) ; remis → vert.
- Un `1,234.56` (milliers anglo-saxons) n'est plus deviné non plus : il est sauté. Aucun test ni
  fixture du dépôt ne porte de montant OFX à séparateur de milliers.
