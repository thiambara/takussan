---
id: TCK-835
title: "Facture PDF : la ligne de détail désigne l'objet facturé au lieu de « Prestation »"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#25-invoice-"
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-26--pdf--quittances-contrats-factures
tags: [back, pdf, invoices, pistes]
---

## Contexte

Réf : **P26.05** du fichier de pistes, `validé` (V7 accordé).

`DocumentPdfController::invoice()` ne passe aucune ligne au gabarit `pdf/invoices/default.blade.php`,
qui retombait toujours sur une ligne unique « Prestation × 1 ». La table `invoices` n'a ni lignes
ni désignation ; seul `invoiceable` (bail ou réservation) et `notes` disent l'objet.

## Décision du porteur

validé — désignation prise dans l'objet facturé (`invoiceable`), repli sur une clé `metadata`

## Reste à faire

une désignation propre à chaque créateur (indemnité de résiliation, retenue sur caution) quand l'objet facturé est un bail

## Objectif utilisateur

Une facture PDF dit, sur sa ligne de détail, ce qu'elle facture.

## Contraintes strictes

- Texte d'acte, en français quelle que soit la langue du lecteur (TCK-672).
- Aucune migration, aucune ligne de facture neuve : la désignation se calcule au rendu.
- Une facture sans objet ni clé garde « Prestation ».

## Hypothèses (mode sans humain)

- **Forme de la désignation** : « Bail <référence> — <titre du bien> » et « Réservation
  <référence> — <titre du bien> » ; sans titre, la référence seule ; sans référence, `LS-<id>`
  (comme la quittance) ou `n° <id>`.
- **La clé de repli s'appelle `metadata.designation`** (chaîne non vide). Aucun créateur ne la pose
  encore, et `StoreInvoiceRequest` ne reçoit pas de `metadata` : elle sert une facture sans objet.
- **L'objet supprimé (soft delete) désigne encore sa facture** : la facture survit au bail.
- L'adresse du bien n'est pas lue : `Address` n'a pas d'attribut `full_address` (la quittance le
  lit et retombe toujours sur le titre, constat hors périmètre).
- Les deux factures nées du code (indemnité de résiliation, retenue sur caution) sont émises sur le
  bail : elles impriment « Bail … — … », et leur `notes` dit toujours l'objet précis. Lire une
  désignation propre au créateur avant l'objet contredirait l'ordre que la décision fixe : c'est le
  reste à faire.

## Delta à produire

- [x] `Invoice::designation()` : objet facturé, puis `metadata.designation`, puis `null`.
- [x] `pdf/invoices/default.blade.php` : la ligne par défaut prend `designation() ?? 'Prestation'`.
- [x] `tests/Feature/Services/FactureDesignationTest.php`.

## Critères d'acceptation

- [x] AC1 — Facture sur le bail `LS-2027-0042` du bien « Villa Almadies » : « Bail LS-2027-0042 —
      Villa Almadies », plus « Prestation ».
- [x] AC2 — Le bail supprimé : la facture dit encore « Bail LS-2027-0043 ».
- [x] AC3 — Facture sur la réservation `BK-0007` du bien « Studio Plateau » : « Réservation BK-0007 —
      Studio Plateau ».
- [x] AC4 — Sans objet, `metadata.designation` = « Frais de dossier » : « Frais de dossier ».
- [x] AC5 — Ni objet ni clé : « Prestation ».

## Hors périmètre

- Des lignes de facture en base (V4).
- Les autres écarts du gabarit (statut brut, taux de TVA à l'anglaise) : P26.06.

## Notes d'implémentation

- **Ablation** : la ligne par défaut ramenée à `'Prestation'`, AC1 à AC4 rougissent, AC5 reste vert.
  Remis : 5 verts ; `InvoicePdfTest`, `InvoiceLegalMentionsTest`, `ActesPdfEnFrancaisTest`,
  `DocumentPdfServiceTest`, `CurrencyPdfRegressionTest` restent verts.
