---
id: TCK-2741
title: "Les six ombres du comparateur flottant ont un nom : des jetons partagés par /app et le site public, au lieu de valeurs entre crochets consignées"
status: todo
phase: P2
family: front
estimate: S
wave: null
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2618]
blocks: []
spec_refs:
  features: []
  models: []
  tickets:
    - docs/backlog/tickets/done/TCK-2618-menus-et-onglets-par-persona.md
tags: [front, comparateur, design-system, jetons, ombres, suivi-lot-2]
---

## Objectif utilisateur

Ce ticket ne change aucun écran à l'œil. Le comparateur flottant (pastille et barre) a la même ombre sur le
site public et dans `/app`. Quand quelqu'un change une ombre de la charte, celles du comparateur suivent au
lieu de rester figées dans six valeurs écrites à la main.

## Contexte

Relevé le 2026-11-11 sur `feat/audit-ux-app-lot-2`, à la vérification du correctif de garde de TCK-2618
(`3918ebeb7`, mineur m2 de la vérification) :

- TCK-2618 monte le comparateur (`CompareProvider` + `CompareFloatingBar`) dans les deux layouts de `/app`.
  `CompareFloatingBar.tsx` entre donc dans le périmètre de `scripts/check-valeurs-arbitraires-app.mjs`.
- Il porte six ombres entre crochets (l. 288, 338, 508, 574, 575, 609 au relevé) :
  - pastille et barre flottantes : deux couches, `0 1px 2px` à 6 % et `0 12px 32px` à 14 % de `--shadow-color` ;
  - pastille sombre : `0 8px 20px -8px` à 55 %, en `in_oklab` ;
  - contour intérieur de vignette : `inset 0 0 0 1px` (`--scrim` 12 % en clair, `--foreground` 14 % en sombre) ;
  - pastille de retrait : `0 1px 3px` à 28 %.
- Aucune ne correspond à l'un des six jetons de `OMBRES` (`src/lib/jetons-de-l-app.ts`) : `barre-collante`,
  `filet`, `bouton-photo`, `actif`, `panneau`, `feuille`. La plus proche, `actif` (`0 1px 2px` à 18 %), diffère
  par le flou et l'alpha. Aucun jeton n'est à deux couches ni intérieur.
- Les six sont donc **consignées** dans `scripts/check-valeurs-arbitraires-app.consigne.json`, avec un motif qui
  renvoie ici. Avant ce ticket, le motif renvoyait à un « ticket de page du comparateur » qui n'existait pas.

## Décision

**Aucune décision du porteur requise** : nommer des valeurs existantes ne change aucun rendu. Si le travail
montre qu'il faut approcher une ombre d'un jeton existant (rendu changé), cette partie revient au porteur avec
la mesure avant/après.

## Contraintes strictes

- **Rendu identique, au pixel.** Chaque jeton neuf vaut exactement la valeur qu'il remplace, dans les deux
  thèmes (`docs/design-guidelines.md`, « les ombres nommées » : `--shadow-color` en `in_srgb`).
- **Le composant sert aussi le site public.** Les jetons sont des `@theme` globaux, pas bornés à `/app`.
- **`tailwind-merge` doit connaître chaque nom neuf** : l'ajouter à `OMBRES`, que `src/lib/utils.ts` lit. Sinon
  un `cn('shadow-<neuf>', 'shadow-sm')` garde les deux classes, sans erreur.
- Un nom dit un rôle (« pastille flottante »), jamais une valeur.

## Delta à produire

- [ ] Des jetons d'ombre pour les rôles du comparateur dans `globals.css`, ajoutés à `OMBRES`, et documentés
      sous « les ombres nommées » de `docs/design-guidelines.md`.
- [ ] `CompareFloatingBar.tsx` les emploie. Son entrée de `check-valeurs-arbitraires-app.consigne.json` disparaît.
- [ ] Une capture avant/après du comparateur ouvert (deux biens), site public et `/app`, à 390 et 1440, en clair
      et en sombre : 0 écart.

## Critères d'acceptation

- [ ] AC1 — `grep -n 'shadow-\[' takussan-web/src/components/compare/CompareFloatingBar.tsx` ne rend rien.
- [ ] AC2 — `node scripts/check-valeurs-arbitraires-app.mjs` est vert, et la consigne n'a plus d'entrée pour ce
      fichier.
- [ ] AC3 — La comparaison avant/après du comparateur ouvert donne 0 écart, sur les huit captures.
- [ ] AC4 — `cn('shadow-<neuf>', 'shadow-sm')` rend `shadow-sm` seul, pour chaque jeton neuf (test de
      `jetons-de-l-app`).

## Hors périmètre

- Le dock du comparateur qui couvre l'écran au téléphone, et sa place sur les pages de paiement
  (`docs/qa/audit-ux-2026-11/01-site-public.md` § 6).
- « Comparer » qui ne mène nulle part sous `/app` au téléphone (mineur m4 de la vérification de TCK-2618).

## Notes d'implémentation

_(Rempli pendant le travail.)_
