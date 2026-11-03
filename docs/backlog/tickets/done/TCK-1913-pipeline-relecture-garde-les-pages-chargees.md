---
id: TCK-1913
title: "Pipeline CRM : une relecture de colonne garde les cartes chargées par « Charger plus »"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-199--listes-chargées-par-morceaux-puis-comptées-groupées-ou-triées-sur-la-seule-page-chargée"
tags: [web, crm, pipeline, pistes]
---

## Objectif utilisateur

L'agent qui a ouvert la suite d'une colonne du pipeline par « Charger plus » la retrouve entière
quand il revient sur l'onglet ou que la colonne est relue : les cartes de la page 2 ne disparaissent
pas, et le bouton ne revient pas à « 50 sur 73 ».

## Contexte

Réf : **P199.01** du fichier de pistes, `retenu · autonome` (A1). TCK-591 (AC25) écrit que
« Charger plus » ajoute la page suivante de la colonne. Le `queryFn` de chaque colonne de
`PipelineKanban` ne lisait que la page 1 : toute relecture (focus après le `staleTime` de 30 s,
remontage, invalidation après un changement d'étape) rendait au cache cette seule page.

## Hypothèses (mode sans humain)

- Parmi les options de la piste, la relecture de toutes les pages déjà chargées est retenue : c'est
  ce que ferait `useInfiniteQuery`, sans changer la forme du cache (`PipelineCustomerCard[]`) que lit
  `useCustomerStageMutation`. `refetchOnWindowFocus: false` aurait laissé le défaut au remontage et
  à l'invalidation.
- Le nombre de pages à relire se déduit des cartes en cache (`ceil(n / 50)`), dédoublonnées par `id`
  comme le fait déjà `loadMore`.

## Delta à produire

- [x] Le `queryFn` des colonnes relit les pages 1 à `ceil(cartes en cache / 50)` et les fusionne sans doublon.
- [x] Le test de pagination étendu d'une relecture après « Charger plus ».

## Critères d'acceptation

- [x] AC1 — 73 leads, « Charger plus » puis relecture de la colonne : la page 2 est redemandée, « Client n°51 » et « Client n°73 » restent rendus, et le bouton « Charger plus » ne revient pas.

## Hors périmètre

- Les autres entrées de l'angle 199 (P199.02 à P199.06), à valider par le porteur.

## Notes d'implémentation

- Ablation : `PipelineKanban.tsx` remis à son état d'avant → le test neuf rouge (la page 2 n'est pas redemandée) ; correctif remis → les 11 tests du dossier verts.
- Piège : le mock de `@/lib/queries/pipeline` dans `PipelineKanban.test.tsx` n'exportait pas `PIPELINE_COLUMN_PAGE_SIZE`, que le `queryFn` lit désormais ; vitest lève sur l'export absent, la colonne passait en erreur. La constante est ajoutée au mock.
