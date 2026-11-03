---
id: TCK-837
title: "Télécharger la facture PDF depuis la modale de détail"
status: done
phase: P2
family: front
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#la-facture-pdf-nest-atteignable-depuis-aucun-écran-ni-aucun-envoi"
tags: [front, payments, invoices, pdf, pistes]
---

## Contexte

Réf : **P26.04** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

`GET /api/invoices/{invoice}/pdf` existe (TCK-077, mentions légales de TCK-594) mais n'a aucun
appelant dans `takussan-web/src`, et la modale de détail d'une facture n'offre aucun lien PDF.
`docs/features.md` promet la génération et l'export PDF des factures.

## Décision du porteur

un bouton de téléchargement du PDF dans `InvoiceDetailDialog`

## Objectif utilisateur

Qui ouvre le détail d'une facture (ou d'un avoir) peut en télécharger le PDF.

## Contrat de données

- `GET /api/invoices/{invoice}/pdf` (existant), autorisé par `InvoicePolicy::view`, la même règle que
  `GET /api/invoices/{invoice}` qui alimente la modale : le bouton ne montre rien à qui ne peut pas
  le suivre.

## Delta à produire

- [x] `InvoiceDetailDialog` : un `BoutonTelechargement` vers `/api/invoices/{id}/pdf`, comme la
  quittance de `CustomerPayments`.
- [x] Clés `payments.invoiceDetail.invoicePdf` et `creditNotePdf` en `fr`, `en` et `wo` (en `wo`, le
  texte français tel quel : wolof en pause depuis le 2026-10-16).
- [x] Test : `InvoiceDetailDialog.pdf.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Un clic sur « PDF de la facture » télécharge `/api/invoices/12/pdf` sous
  `facture-FAC-2026-0012.pdf`.
- [x] AC2 — Sur un avoir, le bouton dit « PDF de l'avoir » et le fichier se nomme `avoir-….pdf`.

## Hors périmètre

- Joindre le PDF à l'envoi par e-mail de la facture (aucun e-mail ne joint de PDF aujourd'hui).
- Le nom de fichier que l'API pose (`facture-…` même pour un avoir) : P26.06.

Hypothèses (mode sans humain) : le bouton est offert dans tous les statuts, brouillon compris, la
route ne refusant aucun statut ; le nom du fichier téléchargé suit le type du document.

## Notes d'implémentation

- Ablation : composant remis à `pre-dev` (41f289014), les deux tests rougissent (aucun bouton) ;
  correctif remis, 2 verts.
