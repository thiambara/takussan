---
id: TCK-756
title: "Barres d'onglets qui défilent dans leur boîte"
status: done
phase: P2
family: front
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#11-gestion-des-biens"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-8--parcours-sur-téléphone"
tags: [front, ui, mobile, pistes]
---

## Contexte

Réf : **P08.08** du fichier de pistes, `validé` (critère accordé : V7). La primitive `TabsList`
(`ui/tabs.tsx`) est `inline-flex w-fit` sans `overflow` : les cinq onglets des paiements (454 px)
et ceux du bien (394 px) débordent des 328 px disponibles à 360, mesuré par le mesureur.
`CustomerDetailTabs` contourne seul, par une enveloppe `overflow-x-auto`.

## Décision du porteur

overflow-x-auto dans TabsList, patron de CustomerDetailTabs

## Objectif utilisateur

Atteindre tous les onglets sur téléphone sans que la page défile de côté.

## Contrat de données

Aucun.

## Contraintes strictes

- Une liste qui tient ne change pas d'aspect.
- La variante `line` garde son liseré actif (posé 5 px sous la liste) : elle ne défile pas.

## Delta à produire

- [x] `TabsList` : `max-w-full`, `justify-center-safe` ; `overflow-x-auto` sur la variante `default`.
- [x] Test `ui/__tests__/tabs.defilement.test.tsx`.

## Critères d'acceptation

- [x] AC1 — La variante par défaut porte `max-w-full` et `overflow-x-auto`.
- [x] AC2 — Le centrage est `safe` : le début d'une liste qui déborde reste atteignable.
- [x] AC3 — La variante `line` ne défile pas.

## Hors périmètre

- Retirer l'enveloppe de `CustomerDetailTabs`, qui reste juste.
- La variante `line` (`ReportingShell`, console) : ses consommateurs posent déjà leur propre mise
  en page mobile.

## Notes d'implémentation

- `justify-center` seul, avec un débordement, rend le début de la liste hors d'atteinte du
  défilement : d'où `justify-center-safe` (Tailwind 4.2, `safe center`).
- jsdom ne mesure aucune largeur : le test garde les classes. Ablation : primitive d'avant
  remise → AC1 rouge ; AC3 est vert des deux côtés (garde de non-régression) ; remis → 99/99
  verts sur les 18 fichiers des primitives et des consommateurs testés.
- Non observé dans un navigateur réel : la largeur rendue reste celle mesurée par le mesureur.
