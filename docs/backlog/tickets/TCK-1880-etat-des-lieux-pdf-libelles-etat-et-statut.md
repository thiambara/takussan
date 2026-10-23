---
id: TCK-1880
title: "Le PDF de l'état des lieux imprime l'état général, le statut et l'état de chaque pièce par leur libellé, et non par le code de l'enum"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#19-état-des-lieux--inventaires"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-192--libellés-résolus-par-une-clé-bâtie-sur-une-valeur"
tags: [api, pdf, i18n, inventaires, pistes]
---

## Objectif

L'acte d'état des lieux, rendu en français (TCK-672), n'imprime plus « État général : good »,
« Statut : signed » ni « état : fair » sur un document signé par les deux parties.

## Contexte

Réf : **P192.04** du fichier de pistes, `validé (délégué)`.

- `resources/views/pdf/inventories/report.blade.php` prenait `general_condition?->value`,
  `status?->value` et `$room['condition']` et les imprimait tels quels : les codes anglais
  d'`InventoryCondition` et d'`InventoryStatus`.
- Les libellés existent déjà au front (`inventory.conditions.*`, `inventory.status.*`), et le
  gabarit lit déjà ses textes par clé (`inventories.pdf.*`, TCK-596).

## Décision du porteur (déléguée)

> des clés `inventories.pdf.conditions.<excellent|good|fair|poor>` et `inventories.pdf.statuses.<draft|pending_signature|signed|disputed>` dans `lang/fr` et `lang/en` (texte français tel quel en `wo`), reprenant mot pour mot les libellés du front (`inventory.conditions.*` : « Excellent », « Bon », « Correct », « Mauvais » ; `inventory.status.*` : « Brouillon », « En attente de signature », « Signé », « En litige »), lues par `report.blade.php` pour l'état général, le statut et l'état de chaque pièce, repli sur le code si la clé manque ; un test qui rend le PDF d'un état des lieux `signed`, `good`, pièce `fair`, et refuse `good`, `signed` et `fair` ; reste : les enums de la quittance, de la facture et du reçu de réservation, qui restent au reste de P26.06

## Reste à faire

> les enums de la quittance, de la facture et du reçu de réservation, qui restent au reste de P26.06

## Hypothèses (mode sans humain)

- Les textes `en` reprennent mot pour mot `en.json` du front (`inventory.conditions.*`,
  `inventory.status.*`) ; `wo` porte le texte français tel quel (wolof en pause).
- Le repli « sur le code » vaut aussi pour un état de pièce hors enum (les pièces sont un JSON) ;
  une valeur absente garde le tiret `—` d'avant.

## Delta à produire

- [x] `lang/{fr,en,wo}/inventories.php` : groupes `pdf.conditions` et `pdf.statuses`.
- [x] `report.blade.php` : état général, statut et état de chaque pièce lus par ces clés, repli
  sur le code.
- [x] Test : le PDF d'un état des lieux `signed`, `good`, pièce `fair`.

## Critères d'acceptation

- [x] AC1 — `GET /api/inventories/{id}/pdf` d'un état des lieux signé, `good`, pièce `fair` : le
  HTML remis au moteur PDF porte « Bon », « Signé » et « état : Correct », et ni `good`, ni
  `signed`, ni `fair` à leur place.

## Hors périmètre

- La quittance, la facture et le reçu de réservation (reste de P26.06).
- L'empreinte de traçabilité des actes signés : elle couvre les données, jamais le texte rendu.

## Notes d'implémentation

- Le test passe par le vrai `DocumentPdfService` (donc par la locale `fr` des actes) ;
  `Pdf::fake()` remplace le constructeur de spatie, rend quand même le PDF par dompdf, et garde
  dans `$pdf->html` le HTML rendu sous la locale de l'acte. Le motif du test voisin (mock de
  `stream`) rend la vue hors de cette locale, et n'aurait pas jugé le français.
- Ablation : gabarit remis à son état d'avant (clés gardées) →
  `test_pdf_prints_condition_and_status_labels_not_enum_codes` rouge (`<td>Bon</td>` absent) ;
  remis → vert.
