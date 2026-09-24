---
id: TCK-571
title: "Quatre formulaires lisent encore watch() pendant le rendu — le motif que le React Compiler fige en production (cause de TCK-564)"
status: todo
phase: P2
family: bug
estimate: S
wave: 69
created: 2026-09-23
updated: 2026-09-23
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [front, react-compiler, formulaires, react-hook-form]
---

## Objectif utilisateur

Dans un formulaire de l'espace connecté, ce que l'utilisateur change se reflète tout de suite à
l'écran : total d'une facture, commission d'un versement, champs qui dépendent du type de bail,
devise de l'agence.

## Contexte

TCK-564 (retour testeur du 2026-09-23, point W9) a établi la cause d'un défaut que le testeur a vu
dans l'assistant « Publier un bien » : une pastille cliquée ne s'allumait pas. `watch('type')` était
lu pendant le rendu ; `next.config.ts` active `reactCompiler: true`, et le compilateur met la valeur
en cache sur l'identité — stable — de `watch`. Le défaut n'existe **qu'en build compilé** : vitest ne
compile pas, la suite est verte. Le correctif est `useWatch({ control, name })`, déjà employé par
`BookingTunnel.tsx` et désormais par les étapes de l'assistant.

Relevé au `grep` le 2026-09-23, hors assistant — **non mesuré au navigateur** :

| Fichier | Lectures pendant le rendu | Ce qui figerait |
|---|---|---|
| `components/payments/CreatePayoutDialog.tsx:113-117` | `gross_amount`, `commission_rate`, `commission_amount`, `fees_amount`, `currency` | le calcul affiché de la commission et du net |
| `components/payments/CreateInvoiceDialog.tsx:97-99` | `items`, `tax_rate`, `currency` | les totaux de la facture |
| `components/leases/CreateLeaseForm.tsx:105-108` | `type`, `property_id`, `tenant_id` | les champs qui dépendent du type et du bien choisis |
| `components/admin-agency/AgencyConfigForm.tsx:119` | `currency` | la devise affichée |

⚠ Un composant que le compilateur choisit de ne pas optimiser n'est pas touché : **mesurer chacun
au navigateur, sur un build de production, avant de le déclarer atteint.**

## Critères d'acceptation

- [ ] Chacun des quatre formulaires est mesuré sur `npm run build && npm run start` : la valeur
      affichée suit-elle la saisie ? Le verdict, par fichier, est écrit ici.
- [ ] Toute lecture pendant le rendu passe par `useWatch` ; aucune lecture `form.watch(…)` ne
      reste dans le corps d'un composant.
- [ ] Une garde empêche le motif de revenir (la garde AST de TCK-564,
      `property-form/__tests__/abonnement-des-etapes.test.tsx`, étendue à tout `src/`, ou une
      règle ESLint), et elle rougit sur une réintroduction.

## Hors périmètre

- L'assistant « Publier un bien » : traité par TCK-564.
