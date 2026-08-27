---
id: TCK-404
title: "`--chart-3` rend 2,57:1 sur `--card` en thème clair — décider de la valeur ou du rôle"
status: todo
phase: P2
family: front
estimate: S
wave: 48
created: 2026-08-27
updated: 2026-08-27
depends_on: [TCK-374]
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
tags: [front, design-system, a11y, charts]
---

## Objectif utilisateur

Un lecteur du back-office distingue toutes les couleurs de la charte sur une carte blanche, y
compris l'ambre — ou bien la charte assume que l'ambre n'est pas une couleur de série.

## Contexte

Mesuré le 2026-08-27 pendant TCK-374, par `node scripts/check-chart-contrast.mjs --report` :

| jeton | clair (`--card #ffffff`) | sombre (`--card #2a2018`) |
|---|---|---|
| `--chart-1` `#a85332` | 5,32:1 ✓ | 4,83:1 ✓ |
| `--chart-2` `#5d6e4f` | 5,51:1 ✓ | 4,48:1 ✓ |
| **`--chart-3` `#c89a4a`** | **2,57:1 ✗** | 8,17:1 ✓ |
| `--chart-4` `#6e655a` | 5,72:1 ✓ | 7,01:1 ✓ |
| `--chart-5` `#1f1812` | 17,53:1 ✓ | 15,16:1 ✓ |

Le seuil de 3:1 est celui de WCAG 2.2 §1.4.11 pour un objet graphique porteur de sens.

**Deux choses rendent ce défaut coûteux, et aucune n'est le nombre lui-même.**

1. **Il n'existe qu'en thème CLAIR.** En sombre, `--chart-3` est le deuxième meilleur jeton de la
   charte. Une vérification faite dans un seul thème — le réflexe — conclut l'inverse de la vérité.
2. **Le ticket qui l'a rencontré supposait le contraire.** TCK-374 posait que « la charte fournit
   déjà l'échelle ; la suivre suffit, et elle règle le contraste par la même occasion ». Mesuré,
   c'est faux d'un jeton sur cinq — et `--chart-3` rend moins bien que l'`emerald-500` hors charte
   qu'il était censé remplacer (2,54:1). *Adopter une charte n'est pas la mesurer.*

TCK-374 a **écarté** le jeton de l'ordre des séries (`1, 2, 4, 5` dans
`takussan-web/src/components/charts/palette.ts`) plutôt que de le corriger : changer la valeur d'un
jeton documenté est une décision de charte, hors du delta d'un ticket `S`. Ce ticket-ci porte cette
décision.

## Contrat de données

Aucun.

## Direction UX / Artistique

L'ambre de la charte sert aussi de **fond** (le ton `warning` de `StatCard` le porte à 15 %
d'opacité, où le seuil de 3:1 ne s'applique pas). Une décision qui ne regarderait que la série
casserait ce second usage. Les deux rôles doivent être tranchés ensemble.

## Contraintes strictes (métier)

- Toute nouvelle valeur reste dans la direction « Ancrage Local Contemporain » (`docs/design-guidelines.md`).
- Si `--chart-3` est corrigé, il rentre dans l'ordre des séries de `charts/palette.ts` et la garde
  le mesure — le retirer de la table sans le corriger reste l'état actuel, ce n'est pas une action.

## Delta à produire

- [ ] Trancher : corriger la valeur claire de `--chart-3`, ou acter qu'il n'est pas une couleur de
      série et l'écrire dans `docs/design-guidelines.md`
- [ ] Si correction : nouvelle valeur ≥ 3:1 sur `--card` clair, vérifiée sur les usages de fond
- [ ] Si correction : réintégrer le jeton dans les trois tables de `charts/palette.ts`

## Critères d'acceptation

- [ ] AC1 — `node scripts/check-chart-contrast.mjs --report` reste vert, et mesure **cinq** jetons
      par thème si la voie « corriger » est prise
- [ ] AC2 — la décision est écrite dans `docs/design-guidelines.md`, quelle qu'elle soit
- [ ] AC3 — aucune régression visuelle sur le ton `warning` de `StatCard`, mesuré en clair ET en
      sombre

## Hors périmètre

- Les quatre autres jetons, tous au-dessus du seuil dans les deux thèmes.

## Notes d'implémentation

_(à remplir par implementing-specs)_
