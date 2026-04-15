---
id: TCK-009
title: Export comptable FEC
status: todo
phase: P3
family: applicatif
estimate: M
created: 2026-04-15
updated: 2026-04-15
depends_on: [TCK-005, TCK-028]
blocks: []
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
  models:
    - docs/models-spec.md#25-invoice-
    - docs/models-spec.md#28-payout-
    - docs/models-spec.md#2-agency
    - docs/models-spec.md#30-setting-
tags: [back, accounting, export]
---

## Contexte

Issu du warning `features.md §1.5 P3` (ligne 164), justifié en passe 006 comme
applicatif (export à partir de `Invoice` + `Payout`). Format officiel français
FEC (Fichier des Écritures Comptables, 18 colonnes).

## Objectif

Générer un export FEC sur une période donnée à partir des factures et
reversements d'une agence, validable par la norme officielle.

## Delta à produire

- [ ] Endpoint `GET /api/exports/fec?agency_id=&from=&to=&format=csv|xml`
- [ ] Permission `accounting.export`
- [ ] Service `FecExportService` (18 colonnes: JournalCode, JournalLib, EcritureNum, EcritureDate, CompteNum, CompteLib, CompAuxNum, CompAuxLib, PieceRef, PieceDate, EcritureLib, Debit, Credit, EcritureLet, DateLet, ValidDate, Montantdevise, Idevise)
- [ ] Mapping comptes comptables dans `Setting` (`scope=agency`, `key=accounting.chart`)
- [ ] Aperçu HTML avant téléchargement
- [ ] Tests sur jeu minimal (2 factures + 1 reversement)

## Critères d'acceptation

- [ ] Le fichier généré passe la validation FEC officielle (tabulation, ISO-8859-15, CRLF)
- [ ] `Invoice` génère une ligne débit client, `Payout` une ligne crédit bailleur
- [ ] L'aperçu HTML affiche les 20 premières lignes
- [ ] Un utilisateur sans permission `accounting.export` reçoit 403

## Hors périmètre

- Import FEC inverse
- Bilan / compte de résultat

## Notes d'implémentation

_(à remplir par spec-coder)_
