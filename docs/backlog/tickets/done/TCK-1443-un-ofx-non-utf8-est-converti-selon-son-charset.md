---
id: TCK-1443
title: "Un OFX qui n'est pas de l'UTF-8 se convertit selon le jeu de caractères qu'il déclare"
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

Réf : **P157.04** du fichier de pistes, `validé (délégué)` (critère V7 accordé).

La validation dispense l'OFX du contrôle UTF-8 parce qu'il « déclare son jeu de caractères »
(TCK-593, R6), mais `OfxDriver` ne lisait pas `CHARSET` : un `NAME` accentué en Windows-1252
faisait échouer l'insertion (SQLSTATE 22021), relevé `failed`, toutes ses transactions perdues.

## Décision du porteur (déléguée)

validé (délégué) — convertir le contenu OFX en UTF-8 avant l'analyse, selon l'en-tête `CHARSET` (OFX 1.x : `1252` → Windows-1252, `ISO-8859-1`) ou l'`encoding` de la déclaration XML (OFX 2), Windows-1252 par défaut pour un contenu qui n'est pas de l'UTF-8 valide et ne déclare rien d'utilisable ; un contenu déjà UTF-8 valide n'est pas converti ; l'OFX n'est pas refusé à l'import (TCK-593 R6) ; test : le fichier de la sonde, importé et lu `SOCIÉTÉ DIOP`, la seconde transaction présente

## Contrat de données

- `OfxDriver::parse()` convertit le contenu en UTF-8 avant l'analyse : `CHARSET` (OFX 1.x) ou
  `encoding` de la déclaration XML (OFX 2) ; `ISO-8859-1` (et ses alias `ISO8859-1`,
  `8859-1`, `LATIN1`) → ISO-8859-1, toute autre valeur (`1252`, `NONE`, une déclaration
  UTF-8 démentie par le contenu) → Windows-1252.
- Un contenu déjà UTF-8 valide n'est pas converti. La validation ne change pas (pas de refus).

## Delta à produire

- [x] `OfxDriver::toUtf8()`, appelé en tête de `parse()`.
- [x] `tests/Feature/Api/Accounting/OfxJeuDeCaracteresTest.php` (dépôt HTTP, fichier réel, job
  joué en ligne).

## Critères d'acceptation

- [x] AC1 — OFX 1.02 `CHARSET:1252`, `NAME` « SOCIÉTÉ DIOP » en Windows-1252 : 202, relevé
  `ready_for_review`, libellés « SOCIÉTÉ DIOP » et la seconde transaction.
- [x] AC2 — `CHARSET:NONE`, « CŒUR DE VILLE » en Windows-1252 : lu en Windows-1252 (« Œ »).
- [x] AC3 — le même fichier déjà en UTF-8 : lu tel quel.

## Hors périmètre

- L'OFX 2 refusé à l'import par la règle `mimes` : TCK-1445 (P157.05).

## Notes d'implémentation

- `UploadedFile::fake()` est refusé par `mimes:csv,txt,ofx` pour un `.ofx` : le test dépose un
  fichier réel, dont `finfo` lit `text/plain`.
- Ablation : l'appel de `toUtf8()` retiré → 2 rouges (500, SQLSTATE 22021), remis → 3/3.
