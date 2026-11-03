---
id: TCK-1790
title: "Une facture émise imprime les mentions légales, le destinataire et la désignation de son émission"
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
    - "docs/features.md#110-documents--contrats"
  adr:
    - "docs/adr/0039-les-sorties-d-argent.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-140--pdf-figés-face-aux-pdf-recomposés-à-chaque-téléchargement"
tags: [api, facture, pdf, pistes]
---

## Objectif utilisateur

Une facture déjà remise au client, téléchargée de nouveau, se reproduit à l'identique : raison
sociale, NINEA, RCCM et adresse légale de l'agence, nom, courriel et téléphone du client, et
désignation sont ceux du jour de son émission.

## Contexte

Réf : **P140.03** du fichier de pistes.

### Décision du porteur

> validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

**Choix de l'implémenteur** : la `Piste` propose de figer ces valeurs dans `metadata` à l'émission
(dans la transaction d'`InvoiceNumberAllocator`) ou de ranger le PDF. La plus étroite est la
première : quelques clés dans une colonne existante, posées au seul point qui émet, sans fichier
ni stockage neuf, et le sort de `DocumentPdfService::store()` reste lié à P140.02. Elle est
retenue.

Mesuré avant correctif (2026-10-23, `529ebc0ac`) : facture émise par « Alpha SARL », NINEA
111111111, client « Diop », bien « Villa Alpha » ; agence, client et bien renommés ensuite →
`GET /api/invoices/{id}/pdf` imprime les valeurs nouvelles (test de garde rouge sur « Alpha SARL »).

## Hypothèses (mode sans humain)

- Le gel vit dans `metadata.issued` (`agency`, `customer`, `designation`), écrit par
  `InvoiceNumberAllocator::allocate()` dans la mise à jour qui numérote : il ne s'écrit donc qu'une
  fois, comme le numéro.
- Une facture émise avant ce ticket n'a pas `metadata.issued` : elle imprime les valeurs courantes,
  comme avant. Aucune donnée existante n'est réécrite (V4).
- Une facture sans agence n'est pas numérotée par l'allocateur (référence `INV-…`) : elle n'est pas
  figée, et n'imprime de toute façon aucune mention légale.
- L'en-tête commun (nom et logo de l'agence, `pdf.layouts.base`) n'est pas dans le périmètre de la
  `Piste` ; il reste lu au téléchargement.

## Delta à produire

- [x] `InvoiceNumberAllocator` : `metadata.issued` posé à l'attribution du numéro.
- [x] `pdf/invoices/default.blade.php` : mentions, destinataire et désignation lus de
  `metadata.issued` quand il existe.
- [x] Garde : `tests/Feature/Api/InvoiceIssuedMentionsTest.php`.

## Critères d'acceptation

- [x] AC1 — Facture émise, puis agence, client et bien renommés → le PDF imprime les seules valeurs
  d'émission.
- [x] AC2 — Un brouillon imprime les valeurs courantes, et n'a pas `metadata.issued`.
- [x] AC3 — Une facture numérotée sans `metadata.issued` (émise avant) imprime les valeurs courantes.

## Notes d'implémentation

- Ablation : écriture de `metadata` retirée de l'allocateur → AC1 rouge (« Alpha SARL » absent) ;
  remise → vert.
- `metadata` est écrit par le constructeur de requête (`update()` sans cast) : il est encodé à la
  main, fusionné avec la valeur relue sous le verrou de l'agence.
