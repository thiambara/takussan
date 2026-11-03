---
id: TCK-2220
title: "Une garde refuse tout mutate() du front sans chemin d'erreur"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: [TCK-2210, TCK-2212, TCK-2214, TCK-2216, TCK-2218]
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-228--mutations-lancées-par-mutate-sans-onerror-et-dont-lécran-ne-lit-pas-lerreur"
  adr:
    - "docs/adr/0019-l-erreur-d-api-porte-un-code-pas-un-libelle.md"
tags: [front, garde, erreurs, pistes]
---

## Contexte

Réf : **P228.06** du fichier de pistes, `retenu · autonome` (A5 : garde ajoutée, aucun seuil
existant resserré).

Le `QueryClient` n'a ni `MutationCache` ni `onError` par défaut, et rien ne relevait un
`x.mutate(` sans `onError` ni lecture de son erreur : l'angle 228 en a trouvé 18 sur 133 appels,
corrigés par TCK-2210 à TCK-2218.

## Hypothèses retenues

- Garde vitest de relevé statique, sur le modèle de `relais-bff.tck-968.test.ts` ; l'`onError`
  global sur `MutationCache` (l'autre voie de la `Piste`) est un choix d'écran, écarté.
- Un appel a un chemin d'erreur si l'appel passe un `onError`, si sa déclaration ou le crochet
  `useXxx` qui le fournit en porte un, ou si son composant lit `x.error`/`x.isError`. La portée va
  de la dernière déclaration `const x =` jusqu'à la fonction de premier niveau suivante.
- Deux exceptions motivées, que l'explorateur avait déjà écartées : `ImpersonationBanner`
  (`onSettled` qui quitte quoi qu'il arrive) et l'exemple du docblock de `useApiQuery.ts`. Une
  exception qui ne sert plus fait rougir.

## Delta à produire

- [x] `src/lib/__tests__/mutations-chemin-d-erreur.p228-06.test.ts` : relevé, cas synthétiques
      des quatre chemins et de la portée, non-vacuité (> 100 appels), exceptions datées.

## Critères d'acceptation

- [x] AC1 — La garde est verte sur l'arbre, et rouge sur chaque site de l'angle rendu à son état
      d'avant.

## Hors périmètre

- `mutateAsync` (angle 210) et les `mutate` déstructurés (aucun aujourd'hui).

## Notes d'implémentation

- Ablation : les 13 composants de l'angle rendus à `pre-dev` (68ab70c5b) → garde rouge, 16
  variables relevées (les 18 appels de l'explorateur) ; arbre remis → verte.
- Premier jet borné au fichier : il manquait trois sites dont la variable `mutation` partageait
  son nom avec une autre mutation, munie d'`onError`, du même fichier. D'où la portée par
  composant, et son cas synthétique.
