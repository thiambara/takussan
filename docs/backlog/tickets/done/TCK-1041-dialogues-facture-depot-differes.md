---
id: TCK-1041
title: "Paiements et documents de la console : les dialogues de facture et de dépôt se chargent à leur première ouverture"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#110-documents--contrats"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-70--poids-js-initial-des-écrans-de-app"
tags: [front, performance, bundle, zod, pistes]
---

## Contexte

Réf : **P70.04** du fichier de pistes, `retenu · autonome` (A2 : monter un dialogue fermé par
`next/dynamic` à sa première ouverture ne change aucun montant ni aucun rendu, précédents TCK-850 et
TCK-1037).

`PaymentsTabs` importe statiquement `CreateInvoiceDialog`, et `DocumentsLibrary`
`DocumentUploadDialog`, deux formulaires (zod, react-hook-form, `useApiForm`) fermés au chargement.
Le mesureur a mesuré leur retrait : `/app/payments` −88,8 Kio et `/app/documents` −114,7 Kio de JS
initial gzip, zod sorti des deux.

## Objectif

Les listes des paiements et des documents ne chargent plus zod ni react-hook-form avant
l'ouverture d'un formulaire.

## Contrat de données

Aucun. Les dialogues ne changent pas.

## Contraintes strictes

- Un dialogue différé est monté dès sa première ouverture et le reste (crochet `useDejaOuvert`,
  repris de `PropertyDetailContent`, TCK-850), pour que sa fermeture garde son animation.
- **Hypothèse** : le crochet vit dans `src/hooks/useDejaOuvert.ts` ; la copie locale de
  `PropertyDetailContent` n'est pas déplacée (hors périmètre).
- **Hypothèse** : les trois fiches que la piste cite (`AddDocumentButton` sur `/app/customers/[id]`
  et `/app/leases/[id]`, `LeasePaymentDialog`, `BookingPaymentDialog`) ne sont pas traitées : le
  mesureur y a trouvé un gain de 1,2 à 5,9 Kio et zod gardé par d'autres chemins, « à relever avant
  d'y toucher ».

## Delta à produire

- [x] `src/hooks/useDejaOuvert.ts`.
- [x] `CreateInvoiceDialog` (dans `PaymentsTabs`) et `DocumentUploadDialog` (dans
      `DocumentsLibrary`) passent par `next/dynamic`, rendus sous `useDejaOuvert(open)`.
- [x] `payments/page.tsx` et `documents/(liste)/page.tsx` ajoutés à la garde de TCK-1038.
- [x] `DocumentsLibrary.test.tsx` attend le dialogue au lieu de le lire au même tick.

## Critères d'acceptation

- [x] AC1 — Le graphe client de `payments/page.tsx` et `documents/(liste)/page.tsx` n'atteint ni
      `zod`, ni `react-hook-form`, ni `@hookform/resolvers`.
- [x] AC2 — Le bouton de dépôt ouvre toujours le dialogue (`DocumentsLibrary.test.tsx`).
- [x] AC3 — Les tests de `components/payments`, `components/documents` et des finances restent
      verts.

## Hors périmètre

- Les dialogues des fiches client, bail et réservation (voir les hypothèses).
- `CreatePayoutDialog`, `InvoiceDetailDialog`, `PayoutDetailDialog` : aucun ne mène à zod sur
  `/app/payments` (le traceur ne les cite pas).
- `/app/agency/finances`, que le mesureur a vu inchangé par l'ablation.

## Notes d'implémentation

- Avant correctif, 2 rouges : zod et react-hook-form par `CreateInvoiceDialog` et
  `DocumentUploadDialog` (`useApiForm`, `components/forms/index.ts`, `lib/schemas/payment.ts`).
- Ablation : `PaymentsTabs.tsx` et `DocumentsLibrary.tsx` rendus à `HEAD` → les 2 mêmes rouges ;
  correctif remis → 16/16 verts, et 128/128 sur les dossiers touchés.
- Piège : sous vitest, le premier `import()` du dialogue transforme son module à froid, et
  `findByRole('dialog')` dépassait les 3 s de l'attente (6,9 s mesurés). Le test importe le module
  du dialogue en tête : 624 ms.
