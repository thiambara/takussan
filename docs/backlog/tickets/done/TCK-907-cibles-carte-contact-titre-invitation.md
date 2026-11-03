---
id: TCK-907
title: "Carte de contact de la fiche : liens de 24 px soulignés ; titre de l'invitation par le modèle commun"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#petites-améliorations-17"
tags: [front, a11y, pistes]
---

## Contexte

Réf : **P31.07** du fichier de pistes, `validé` (V7 accordé).

Sur la fiche, les liens vers l'agent et l'agence de `PropertyAgentCard` mesuraient 82 × 17 et
108 × 18 px (axe : `target-size`) et ne se distinguaient du texte que par la graisse et au survol.
`/invitations/accept` avait pour titre « Accepter une invitation », sans « — Takussan » :
`invitations/layout.tsx` ne posait aucun modèle.

## Décision du porteur

validé — `min-h-6` et soulignement permanent sur les deux liens de `PropertyAgentCard`, titre de l'invitation par le modèle commun

## Objectif utilisateur

Un visiteur au doigt ou à la souris atteint l'agent et l'agence sans viser au pixel, et les
reconnaît comme des liens ; l'onglet de l'invitation se range avec ceux du site.

## Delta à produire

- [x] `PropertyAgentCard` : `min-h-6` et `underline` sur les deux liens ; celui de l'agent devient
  `inline-block` (tronqué lui-même), seule boîte où `min-height` s'applique.
- [x] `invitations/layout.tsx` : `generateMetadata` pose `template: '%s — Takussan'`, avec pour
  défaut le titre du site (`meta.home.title`).
- [x] Tests.

## Critères d'acceptation

- [x] AC1 — Les deux liens portent `min-h-6` et un soulignement permanent ; celui de l'agent est
  une boîte.
- [x] AC2 — Le layout des invitations pose « %s — Takussan », et la page le remplit par
  « Accepter une invitation ».

## Hors périmètre

- La mesure de la taille des cibles au navigateur (jsdom ne pose aucune feuille de style).

## Notes d'implémentation

- **Reproduction** : `PropertyAgentCard.tck-907.test.tsx` → 2 rouges (`hover:underline` seul) ;
  `invitations/__tests__/titre-d-onglet.test.ts` → 1 rouge (`generateMetadata` absent du layout).
- **Ablation** : les deux fichiers remis → les 3 mêmes rouges ; correctif rétabli → 120 verts dans
  les tests de la fiche et des invitations, et `vitest related` 8 fichiers, 38 verts.
- **Piège** : un commentaire JSX dans la branche d'un ternaire en fait deux enfants, et la
  transformation échoue ; il est au-dessus du `<p>`.
