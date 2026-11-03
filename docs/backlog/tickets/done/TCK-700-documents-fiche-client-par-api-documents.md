---
id: TCK-700
title: "L'onglet Documents de la fiche client dépose par POST /api/documents, plus par une route absente"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#110-documents--contrats
    - docs/features.md#16-crm--relation-client
  models:
    - docs/models-spec.md#22-document-
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-13--code-mort-et-doublons
tags: [web, crm, documents, pistes]
---

## Contexte

Réf : **P13.04** du fichier de pistes, `retenu · autonome` (classement A1).

L'onglet Documents de la fiche client (`CustomerDocumentsPanel`, monté par
`CustomerDetailTabs.tsx:107`) appelait `uploadCustomerDocumentAction`, qui poste sur
`/api/customers/{id}/documents` : aucune route de l'API ne la sert
(`php artisan route:list --path=customers | grep -i doc` vide, re-mesuré le 2026-10-16). Le dépôt
échouait donc toujours. La même fiche monte `AddDocumentButton`, qui passe par
`POST /api/documents` avec `documentable_type=customer` et écrit la relation
`Customer::documents()` que l'onglet liste par `include=documents`.

## Objectif

Le dépôt d'une pièce depuis l'onglet Documents passe par `AddDocumentButton`, et la liste de
l'onglet se met à jour après le dépôt.

## Delta à produire

- [x] `CustomerDocumentsPanel` : la zone de dépôt (input fichier + server action) est remplacée par
      `AddDocumentButton` (`documentableType="customer"`, `documentableId` de la fiche).
- [x] `AddDocumentButton` et `DocumentUploadDialog` : prop optionnelle `onUploaded`, appelée
      après un dépôt réussi ; le panneau y passe `router.refresh()` (la liste vient du rendu
      serveur de la fiche).
- [x] Retrait du chemin cassé : `uploadCustomerDocumentAction` et `uploadCustomerDocument`.
- [x] Test `CustomerDocumentsPanel.test.tsx`.

## Critères d'acceptation

- [x] AC1 — L'onglet monte `AddDocumentButton` pour la fiche (`customer`, son id), et n'offre plus
      de sélecteur de fichier propre.
- [x] AC2 — Un dépôt réussi rafraîchit la page (`router.refresh()`).
- [x] AC3 — Aucun fichier de `takussan-web/src/` ne vise `/customers/${…}/documents`.

## Hypothèses (mode sans humain)

- Le libellé du bouton est celui d'`AddDocumentButton` (« Ajouter un document », clé existante) :
  aucun texte neuf.
- Le dialogue demande le nom et le type du document, que `StoreDocumentRequest` exige et que
  l'ancien panneau n'envoyait pas : c'est le geste déjà tenu par le bouton d'en-tête de la fiche.

## Hors périmètre

- `validateCustomerDocumentFile`, `CUSTOMER_DOCUMENT_*` et les clés i18n `upload` / `uploadHint`
  du panneau, qui n'ont plus d'appelant dans `src/` hors tests : retrait laissé à un ticket de code
  mort.
- Le bouton d'en-tête de la fiche (`customers/[id]/page.tsx:139`) ne rafraîchit pas la liste
  après un dépôt : il ne passe pas `onUploaded`.

## Notes d'implémentation
- Ablation 1 : `CustomerDocumentsPanel.tsx` remis à sa version de `pre-dev` →
  `CustomerDocumentsPanel.test.tsx` rouge (« Unable to find an accessible element with the role
  "button" and name "ajouter" ») ; remis → 2 verts. Avant tout correctif, le second test rendait
  `['lib/queries/customers.ts']` (le chemin `/api/customers/${…}/documents`).
- Ablation 2 : `onUploaded?.()` retiré de `DocumentUploadDialog` →
  `DocumentUploadDialog.onUploaded.test.tsx` rouge ; remis → vert.
- Ce second test passe par le vrai formulaire : le champ `documentable_id` est `disabled` quand la
  cible est imposée, et il part bien (`documentable_type: 'customer'`, `documentable_id: 42`).
