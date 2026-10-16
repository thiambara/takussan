---
id: TCK-682
title: "« Générer l'échéancier » poste sur la route réelle et lit payments_created"
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
    - docs/features.md#14-location-longue-durée-baux
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-13--code-mort-et-doublons
tags: [front, leases, payments, pistes]
---

## Contexte

Réf : **P13.02** du fichier de pistes, `validé` par le porteur (critère accordé : V1).

Le bouton « Générer l'échéancier » de `/app/leases/[id]` (`LeaseDetail.tsx`) appelle
`useGenerateSchedule`, qui postait sur `/api/leases/{id}/generate-schedule`. Cette route n'existe
pas : la seule est `POST api/leases/{lease}/payments/generate-schedule`
(`routes/api/leases.php:33`). Le clic rendait un 404. Le hook annonçait aussi une réponse
`{ generated }`, alors que `LeaseController::generateSchedule` rend `{ payments_created }`.

## Décision du porteur

`validé`, sans précision : l'option unique de la `Piste` — aligner le chemin et la clé de réponse.

## Objectif

Le bouton « Générer l'échéancier » atteint la route de l'API, et le type de sa réponse est celui
que l'API émet.

## Delta à produire

- [x] `useGenerateSchedule` (`src/lib/queries/leases.ts`) poste sur
      `/api/leases/{id}/payments/generate-schedule`.
- [x] Sa réponse est typée `ApiResponse<{ payments_created: number }>`.
- [x] Test `src/lib/queries/__tests__/generer-echeancier.tck-682.test.tsx`.

## Critères d'acceptation

- [x] AC1 — `useGenerateSchedule(42).mutateAsync({})` émet un `POST` dont le chemin est
      `/api/leases/42/payments/generate-schedule`.
- [x] AC2 — `tsc --noEmit` refuse de lire `payments_created` sur la réponse si le hook annonce
      une autre clé.

## Hypothèses (mode sans humain)

- Aucun appelant ne lit la réponse aujourd'hui (`LeaseDetail.tsx` appelle `mutate({})` sans
  `onSuccess`) : corriger le type ne change rien à l'affichage.
- L'API reste telle quelle : c'est elle qui fait foi (route nommée
  `leases.payments.generate-schedule`, éprouvée par `GenerateLeasePaymentScheduleTest`).

## Hors périmètre

- `GenerateSchedulePayload` déclare `start_date` et `end_date`, que
  `LeaseController::generateSchedule` ne lit pas. L'écran n'en envoie aucun ; le type est laissé
  tel quel.
- Aucun message de succès ou d'échec n'est affiché après le clic : ce serait un comportement
  visible neuf (V7).

## Notes d'implémentation

- Rouge avant correctif : le chemin émis était `/api/leases/42/generate-schedule`, et `tsc`
  refusait `payments_created` sur `{ generated: number }` (TS2339).
- Ablation : correctif retiré, le test rougit sur le chemin et `tsc` rend 1 erreur ; remis, vert
  et `tsc` propre.
