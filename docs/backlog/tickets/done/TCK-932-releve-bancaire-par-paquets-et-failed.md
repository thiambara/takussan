---
id: TCK-932
title: "Un gros relevé bancaire s'analyse par paquets, et un job mort ne laisse plus le relevé `processing`"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#40-bankstatement-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#un-relevé-bancaire-de-10-mo-accepté-par-la-validation-tue-le-job-en-erreur-fatale-de-mémoire-et-le-relevé-reste-processing-à-vie"
tags: [back, accounting, reconciliation, queue, pistes]
---

## Contexte

Réf : **P43.01** du fichier de pistes, `validé` par le porteur (critères accordés : V7 et V1).

`ParseBankStatementJob` accumule toutes les lignes et toutes les dates avant de les insérer. Un CSV
de 10 Mo, que la validation accepte (`max:10240`), dépasse les 256 Mo de `docker/php.ini` et meurt
en erreur fatale. Le passage à `failed` n'existe que dans le `catch`, qu'une erreur fatale
n'exécute pas, et le job n'a pas de `failed()` : le relevé reste `processing` à vie, et le
ré-import du même fichier est refusé.

## Décision du porteur

un `failed()` qui passe le relevé à `failed` s'il est encore `processing`, et l'insertion des lignes par paquets au fil du générateur, dans la transaction ; la taille acceptée (10 Mo) ne baisse pas

## Objectif utilisateur

L'agence qui dépose un gros relevé le voit analysé, ou au pire `failed` et ré-importable, jamais
bloqué en `processing`.

## Hypothèses (mode sans humain)

- Paquets de 500 lignes, la taille déjà employée par l'insertion d'avant.
- `failed()` ne journalise rien de plus : le worker inscrit déjà le job dans `failed_jobs`, et le
  `catch` journalise les levées attrapables.

## Delta à produire

- [x] `ParseBankStatementJob::handle()` : la lecture du fichier se fait dans la transaction ;
  chaque paquet de 500 lignes est inséré dès qu'il est plein ; seuls le compte et les deux bornes
  de période restent en mémoire.
- [x] `ParseBankStatementJob::failed()` : passe le relevé à `failed` s'il est encore `processing`.
- [x] Tests : `LargeBankStatementParseTest` (4 cas).

## Critères d'acceptation

- [x] AC1 — Un relevé de 30 000 lignes s'analyse en entier (lignes, compte, période) avec moins
  de 48 Mo de surcroît de mémoire.
- [x] AC2 — `failed()` sur un relevé `processing` le rend `failed`, et le même fichier se
  ré-importe (202, l'ancien relevé est remplacé).
- [x] AC3 — `failed()` ne touche pas un relevé déjà lu, et ne lève pas sur un relevé supprimé.

## Hors périmètre

- La taille acceptée (10 Mo) ne change pas.
- Le délai du worker (`--timeout`, `compose.api.yml`) et la limite mémoire du conteneur (P43.04),
  chemins fermés aux agents.

## Notes d'implémentation

- Avant correctif : 30 000 lignes → 217 Mo de surcroît (rouge) ; `failed()` absent → 3 rouges.
- Ablations : `PAQUET = PHP_INT_MAX` (tout accumulé) → 1 rouge ; corps de `failed()` neutralisé →
  1 rouge (AC2). Tout remis → 4 verts, 3,1 Mo de surcroît.
- La mesure de mémoire s'appuie sur `memory_reset_peak_usage()` (PHP ≥ 8.2) : le pic est celui
  de l'analyse seule, pas du processus de test.
