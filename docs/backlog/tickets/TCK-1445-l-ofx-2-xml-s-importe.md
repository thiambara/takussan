---
id: TCK-1445
title: "L'OFX 2 (XML) s'importe : `xml` admis pour le format `ofx`"
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

Réf : **P157.05** du fichier de pistes, `validé (délégué)` (critère V7 accordé).

`StoreBankStatementRequest` juge `mimes:csv,txt,ofx` sur le type que `finfo` lit dans le
contenu. Un OFX 2.11 commence par une déclaration XML : `text/xml` → `xml` → 422, alors que
`OfxDriver` annonce lire l'OFX 2 et que le front propose `ofx` pour tout `.ofx`.

## Décision du porteur (déléguée)

validé (délégué) — admettre l'OFX 2 : le type `xml` est accepté quand `source_format` vaut `ofx` (et lui seul, le CSV garde `csv,txt`), la promesse du docblock d'`OfxDriver` reste ; garde : un test HTTP qui dépose un OFX 1.02 SGML et un OFX 2.11 XML en `UploadedFile` réel, tous deux acceptés

## Contrat de données

- `source_format = ofx` (fourni, ou déduit de l'extension `.ofx`) : `mimes:csv,txt,ofx,xml`.
- Tout autre format : règle inchangée (`mimes:csv,txt,ofx`). Hypothèse : « le CSV garde
  `csv,txt` » se lit « le CSV ne gagne pas `xml` » ; sa règle n'est pas resserrée.
- Le docblock d'`OfxDriver` (« OFX 2.x (XML) files also work ») reste.

## Delta à produire

- [x] Règle `file` de `StoreBankStatementRequest` selon `source_format`.
- [x] `tests/Feature/Api/Accounting/OfxDeuxAImportTest.php` (fichiers réels).

## Critères d'acceptation

- [x] AC1 — OFX 2.11 XML en `.ofx` : 202, deux lignes lues.
- [x] AC2 — OFX 1.02 SGML en `.ofx` : 202.
- [x] AC3 — le même XML déposé en `.csv`, format `csv` : 422 sur `file`.

## Hors périmètre

- Le `finfo` de l'image de l'API n'est pas mesuré (limite écrite par le mesureur).

## Notes d'implémentation

- Ablation : `xml` retiré de la règle `ofx` → 1 rouge (AC1, 422), remis → 3/3.
