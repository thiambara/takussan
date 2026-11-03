---
id: TCK-1461
title: "L'index de components/forms ne réexporte plus les sélecteurs de date"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-137--écrans-qui-chargent-les-champs-de-formulaire-et-le-calendrier-par-le-fichier-indexts-de-componentsforms"
tags: [front, performance, formulaires, pistes]
---

## Objectif utilisateur

Une page qui prend un champ de formulaire sans afficher de date (connexion, inscription,
`/app/agency`, `/app/customers/new`, `/app/maintenance/new`, `/app/bookings/[id]`) ne
charge plus react-day-picker ni date-fns.

## Contexte

Réf : **P137.03** du fichier de pistes, `retenu · autonome` (A2).

Mesuré avant correctif sur `58c404ecf` : les six pages atteignent react-day-picker et date-fns
par `components/forms/index.ts`, qui réexporte `FormDatePicker` et `FormDateTimePicker`
(garde neuve, 7 rouges).

## Hypothèses (mode sans humain)

- La piste propose deux voies : réécrire les 32 importeurs de l'`index.ts`, ou retirer les deux
  sélecteurs de l'`index.ts`. **Retenue : le retrait**, la plus étroite (8 importeurs à
  reprendre, et toute page future en profite), avec la garde qui le tient.

## Delta à produire

- [x] `components/forms/index.ts` : plus de `FormDatePicker` ni de `FormDateTimePicker`.
- [x] Les 8 importeurs les prennent à leur fichier (`CreateInvoiceDialog`, `BookingTunnel`,
  `PropertyForm`, `StepPrix`, `LeasePaymentDialog`, `CreateLeaseForm`, `InventoryForm`,
  `DocumentUploadDialog`).
- [x] Garde : `components/forms/__tests__/index-sans-selecteur-de-date.test.ts` (l'index, et les
  six pages sans calendrier).

## Critères d'acceptation

- [x] AC1 — L'index ne réexporte aucun des deux sélecteurs.
- [x] AC2 — Les six pages n'atteignent ni react-day-picker ni date-fns ; react-hook-form y reste
  (elles ont un formulaire).

## Notes d'implémentation

- Ablation : `index.ts` remis à son état antérieur (importeurs gardés) → 7 rouges ; rétabli →
  7 verts.
