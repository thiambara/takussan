---
id: TCK-1459
title: "L'écran des intégrations ne charge plus react-hook-form, son résolveur ni le calendrier"
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
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-137--écrans-qui-chargent-les-champs-de-formulaire-et-le-calendrier-par-le-fichier-indexts-de-componentsforms"
tags: [front, performance, integrations, pistes]
---

## Objectif utilisateur

`/app/agency/integrations` se charge sans react-hook-form, `@hookform/resolvers`,
react-day-picker ni date-fns : son formulaire est validé à la main.

## Contexte

Réf : **P137.02** du fichier de pistes, `retenu · autonome` (A2).

Mesuré avant correctif sur `58c404ecf` : le graphe client de la page atteint
`@hookform/resolvers` par `hooks/useApiForm.ts` et le calendrier et react-hook-form par
`components/forms/index.ts` (garde neuve, rouge).

## Hypothèses (mode sans humain)

- zod reste chargé par `lib/schemas/setting.ts` : le charger à l'envoi n'est pas dans la piste.

## Delta à produire

- [x] `IntegrationsManager.tsx` : `FormError`/`FormGlobalError` pris à
  `@/components/forms/FormError`, `useTraducteurValidation` à `@/hooks/useTraducteurValidation`.
- [x] `IntegrationWebhookEndpoint.tsx` : `FormError` pris à `@/components/forms/FormError`.
- [x] Garde : `src/app/(dashboard)/__tests__/graphe-client-des-integrations.test.ts`.

## Critères d'acceptation

- [x] AC1 — La page n'atteint ni react-hook-form, ni `@hookform/resolvers`, ni le calendrier.
- [x] AC2 — Comportement inchangé : les trois fichiers de test des intégrations restent verts.

## Notes d'implémentation

- Ablation : imports remis → 1 rouge ; rétablis → 1 vert.
