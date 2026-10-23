---
id: TCK-1917
title: "Une ligne de relevé à devise inconnue est sautée et comptée, et la recherche manuelle filtre la devise de la ligne"
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
    - "docs/features.md#15-transactions--paiements"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-157--lignes-de-relevé-importées-face-au-rapprochement"
tags: [back, front, rapprochement, ofx, csv, pistes]
---

## Contexte

Réf : **P157.01** du fichier de pistes, `validé` par le porteur (critère V7 accordé).

Une devise de trois lettres hors de `Currency` (`ABC`, `<CURDEF>ABC`) entrait telle quelle : la
ligne ne s'appariait jamais, et l'écran l'affichait en « F CFA ». La recherche manuelle, elle, ne
filtrait pas la devise : elle proposait une échéance en XOF à une ligne en EUR, que
`ReconciliationManager::confirmMatch()` refusait ensuite en 422.

## Décision du porteur

validé — validation du porteur (2026-10-23) : dans les deux pilotes, un code hors de `Currency` fait sauter la ligne, comptée ; un code de `Currency` autre que celui de l'agence est gardé (TCK-1475) ; `PaymentSearchService` filtre sur la devise de la ligne ; la recommandation du délégué est écartée

## Contrat de données

- CSV : la cellule de `currency_column`, après l'alias du franc CFA (TCK-1704), doit être un cas de
  `Currency` ; sinon la ligne est sautée et comptée dans `ParseTally`. La cellule vide était déjà
  sautée et comptée depuis TCK-1704 (P124.01) : inchangé.
- OFX : le `CURDEF` du compte (TCK-1475) doit être un cas de `Currency` ; sinon chaque transaction
  du compte est sautée et comptée. Un compte sans `CURDEF` prend la devise de l'agence, comme avant.
- `GET /api/agencies/{agency}/bank-statements/payment-search` accepte `currency` (chaîne de 3
  caractères, facultative) : seuls les paiements de cette devise sont rendus, filtrés en SQL avant
  la limite de chaque type. Sans `currency`, toutes les devises, comme avant.
- Front : `usePaymentSearch` porte la devise de la ligne (`ligne.currency`), et la clé de cache
  aussi.
- Hypothèse : un code inconnu passé en `currency` ne rend rien (aucun paiement ne le porte), plutôt
  que 422 : une ligne importée avant ce ticket peut encore porter un tel code.

## Delta à produire

- [x] `CsvDriver::parseCurrency` et `OfxDriver::parse` : code jugé par `Currency::tryFrom`.
- [x] `SearchPaymentsRequest`, `PaymentSearchController`, `PaymentSearchService` : `currency`.
- [x] `usePaymentSearch`, `reconciliationKeys.search`, `PaymentSearchDialog`.

## Critères d'acceptation

- [x] AC1 — CSV `ABC`, `usd`, `XOF` → lignes `USD`, `XOF`, une sautée.
- [x] AC2 — OFX `CURDEF` `ABC` (deux transactions) puis `EUR` → une ligne `EUR`, deux sautées.
- [x] AC3 — recherche `currency=EUR` → la seule échéance en EUR ; `XOF` → la seule en XOF ; `ABC`
  → rien ; sans `currency` → les deux ; `currency[]` → 422.
- [x] AC4 — le dialogue de recherche passe la devise de la ligne.

## Hors périmètre

- Le formatage « F CFA » d'un code inconnu par `currency.ts` (repli sur XOF) : plus aucune ligne
  neuve n'en porte ; les lignes déjà importées ne sont pas réécrites.

## Notes d'implémentation

- Le filtre de devise est en SQL, dans chaque recherche par type : filtré après coup, il aurait
  perdu les paiements de la bonne devise derrière la limite de 10 par type.
- Ablation : contrôle `Currency::tryFrom` retiré des deux pilotes → 2 rouges dans
  `StatementParserTest` ; filtre SQL neutralisé → 1 rouge dans `PaymentSearchTest` ;
  `ligne.currency` retiré du dialogue → 2 rouges dans `rapprochement.test.tsx`. Remis → verts.
