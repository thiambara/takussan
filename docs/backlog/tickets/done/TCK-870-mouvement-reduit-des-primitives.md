---
id: TCK-870
title: "Mouvement réduit : primitives sans animation d'état, rangée de biens sans glissement"
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
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-7--accessibilité-du-front-wcag-22-aa"
  design:
    - "docs/design-guidelines.md#animations-standard"
tags: [front, accessibilite, pistes]
---

## Contexte

Réf : **P07.11** du fichier de pistes, `retenu · autonome` (classements A4 et A1). Les animations
d'ouverture et de fermeture de tw-animate-css (`animate-in`, `animate-out`, avec `slide-*`,
`zoom-*`, `fade-*`) ignorent `prefers-reduced-motion` dans les primitives `ui/`, et les flèches
de `PropertyRow` font glisser la rangée sans condition. `docs/design-guidelines.md`
(« Animations standard ») écrit déjà qu'une animation se neutralise sous mouvement réduit.

## Objectif utilisateur

Un visiteur qui a demandé moins de mouvement voit les dialogues, tiroirs, menus, listes et
infobulles s'ouvrir sans glisser ni zoomer, et la rangée de biens sauter sans glisser.

## Contraintes strictes

- **Mesuré** : la forme proposée par la piste, `motion-reduce:animate-none`, ne suffit pas. Sous
  `shadcn/tailwind.css`, `data-open:animate-in` compile en `.x:where([data-open]…)`, de même
  spécificité que `.y` sous `@media`, et Tailwind l'émet après `motion-reduce:animate-none` :
  l'animation gagnerait. La neutralisation porte donc l'état :
  `motion-reduce:data-open:animate-none` et `motion-reduce:data-closed:animate-none`.
- **Mesuré** : `behavior: 'auto'` ne suffit pas pour la rangée, qui porte `scroll-smooth` : il
  reprend le `scroll-behavior` du CSS. Sous mouvement réduit, `behavior: 'instant'`, et
  `motion-reduce:scroll-auto` sur la rangée.
- **Hypothèse** : les six primitives de `ui/` qui portent une animation d'état sont prises
  (`dialog`, `sheet`, `popover`, `select`, plus `dropdown-menu` et `tooltip`, que la piste ne nomme
  pas mais que « dans les primitives » couvre).

## Delta à produire

- [x] Les six primitives : neutralisation de chaque `data-open:animate-in` et
      `data-closed:animate-out` sous mouvement réduit.
- [x] `PropertyRow` : défilement des flèches sans glissement sous mouvement réduit.
- [x] Garde `src/components/ui/__tests__/mouvement-reduit.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Toute chaîne de classes de `ui/` qui anime un état porte sa neutralisation.
- [x] AC2 — Compilée avec les feuilles du dépôt, la neutralisation vient après l'animation, sous
      le même état et sous `@media (prefers-reduced-motion: reduce)`.
- [x] AC3 — Sous mouvement réduit, les flèches de `PropertyRow` défilent en `instant` ; sinon en
      `smooth`.

## Hors périmètre

- Les animations d'état posées hors de `ui/` (`Navbar`, `MessagesPage`, `EventDetailSheet`,
  `FilterSidebar`, `PropertyLightbox`) : la piste ne vise que les primitives.

## Notes d'implémentation

- **Ablation** : sources d'avant remises, test gardé → 7 rouges sur 29 (les six primitives et le
  cas « mouvement réduit » de `PropertyRow`) ; correctif remis → verts. Le cas de compilation
  reste vert sans le correctif : il tient le mécanisme (ordre et spécificité), pas les sources.
