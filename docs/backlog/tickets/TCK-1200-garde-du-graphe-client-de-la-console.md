---
id: TCK-1200
title: "Garde : aucune page de la console super-admin ne charge zod ni react-hook-form"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1194, TCK-1196]
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#aucune-garde-ne-trace-le-graphe-client-des-écrans-de-super-admin"
tags: [front, performance, super-admin, garde, pistes]
---

## Contexte

Réf : **P104.04** du fichier de pistes, `retenu · autonome` (A5 : garde ajoutée, aucun seuil
resserré). Le test qui refuse zod, react-hook-form et `@hookform/resolvers` dans les écrans de
lecture (TCK-1038) ne lit que `(dashboard)/app` ; aucun test ne trace le graphe client de
`(super-admin)`. P104.01 et P104.02 n'y auraient rien cassé.

## Objectif

Une page de la console, ou son layout, qui atteindrait ces paquets au chargement fait rougir un
test.

## Delta à produire

- [x] `graphe-client-de-la-console.test.ts` : balayage des `page.tsx` et `layout.tsx` de
      `(super-admin)/super-admin`, chacun sans chemin vers zod, react-hook-form ni
      `@hookform/resolvers` ; liste d'exceptions `FORMULAIRES_AU_CHARGEMENT`, vide.

## Critères d'acceptation

- [x] AC1 — Les 37 pages et le layout passent aujourd'hui.
- [x] AC2 — `TagsManager.tsx` rendu à son état d'avant TCK-1194 fait rougir la garde sur
      `tags/page.tsx`.

## Hors périmètre

- react-day-picker : huit entrées de la console l'atteignent encore (mesuré : `agencies`,
  `agencies/[id]`, `agency-upgrade-requests`, `announcements`, `audit`, `payouts`, `reports`,
  `system/maintenance`), par des sélecteurs de dates affichés au chargement ou non relevés. Seuls
  `tags` et `privacy-requests` en sont gardés (TCK-1194, TCK-1198).
- Un seuil de poids sur `poids-des-routes.mjs`.

## Hypothèses

- Les pages sont trouvées par balayage plutôt qu'énumérées, comme le fait TCK-1038 : une page neuve
  entre d'elle-même dans la garde, et une page qui est un formulaire au chargement s'y déclare.

## Notes d'implémentation

- Ablation (2026-10-22) : `TagsManager.tsx` rendu à `pre-dev` → le cas TCK-1200 de `tags/page.tsx`
  rougit (avec les cas de TCK-1194 et TCK-1196) ; remis → 42/42 verts.
- Mesure préalable par un test temporaire, retiré : sur les 38 entrées, aucune n'atteint zod,
  react-hook-form ni `@hookform/resolvers` après TCK-1194 et TCK-1196.
