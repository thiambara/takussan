---
id: TCK-1704
title: "Un relevé bancaire dont la devise dit « FCFA » ou dont une référence dépasse 255 caractères se lit au lieu d'échouer en entier"
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
  models:
    - "docs/models-spec.md#41-bankstatementline-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-124--colonnes-bornées-remplies-par-une-valeur-dérivée-ou-recopiée"
tags: [back, accounting, rapprochement, pistes]
---

## Contexte

Réf : **P124.01** du fichier de pistes, `validé` (critères V7 et V1 accordés). Une cellule
`FCFA` dans la colonne devise (`char(3)`), ou une référence ou contrepartie de plus de 255
caractères (`varchar(255)`), fait lever l'insertion du paquet de lignes : le relevé entier passe
`failed`, sans ligne, et sans motif qui nomme la cellule.

## Décision du porteur

validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

**Choix retenu** : pour une devise inconnue, la piste recommande de **sauter la ligne** et de la
compter dans `skipped`, « plutôt que de faire échouer le relevé entier » ; c'est l'option prise.
Aucune recommandation du délégué n'est portée par l'entrée.

## Delta à produire

- [x] `ParsedLine::TEXT_MAX = 255`, la longueur de `reference` et `counterparty`.
- [x] `CsvDriver` : `reference` et `counterparty` tronqués par `mb_substr(…, 0, 255)` ; la devise
  lue passe par `parseCurrency()` : `FCFA`, `F CFA`, `CFA` (casse et espaces indifférents) →
  `XOF` ; un code de trois lettres → en majuscules ; toute autre valeur → ligne sautée et comptée.
- [x] `OfxDriver` : `FITID` (→ `reference`) et `NAME` (→ `counterparty`) tronqués de même ; `raw`
  garde les valeurs d'origine. La devise OFX était déjà bornée par `<CURDEF>([A-Z]{3})`.
- [x] Tests : `StatementParserTest` (un par pilote pour la borne, un pour la devise CSV),
  `BankStatementPipelineTest` (relevé `ready_for_review` de bout en bout, devise et borne).

## Critères d'acceptation

- [x] AC1 — CSV, colonne devise `FCFA`, `F CFA`, `cfa`, `XOF`, et une ligne à `Francs CFA BCEAO` :
  relevé `ready_for_review`, 4 lignes en `XOF`, 1 ligne comptée sautée.
- [x] AC2 — CSV, `reference` et `counterparty` de 300 `é` sur la première de deux lignes : relevé
  `ready_for_review`, 2 lignes, les deux champs à 255 caractères.
- [x] AC3 — OFX, `FITID` et `NAME` de 300 `é` : ligne lue, les deux champs à 255 caractères.

## Hors périmètre

- Une devise vide dans la colonne déclarée fait sauter la ligne (pas de repli sur la devise de
  l'agence) : c'est la lecture littérale de la piste, « une ligne dont la devise n'est pas un code
  de trois lettres ». Hypothèse notée, non soumise.
- Un montant au-delà de `decimal(12,2)` fait toujours échouer le relevé entier (22003) : hors de
  cette piste, relevé dans le rapport.

## Notes d'implémentation

- Ablation : `CsvDriver` et `OfxDriver` remis à `43c553036` → 3 rouges dans
  `StatementParserTest`, 2 dans `BankStatementPipelineTest` (22001) ; correctif remis → 17/17 et
  23/23 verts.
- Piège : `test_le_journal_ne_porte_aucune_valeur_du_releve` et
  `test_l_exception_relancee_ne_recopie_pas_le_releve` provoquaient l'échec d'insertion par une
  contrepartie de 300 caractères, que le correctif tronque désormais. Ils le provoquent par un
  montant hors de `decimal(12,2)` (22003), et gardent leurs témoins de journal.
