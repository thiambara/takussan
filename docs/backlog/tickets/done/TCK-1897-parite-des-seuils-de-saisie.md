---
id: TCK-1897
title: "Un test compare chaque seuil du front qui recopie l'API à la règle PHP recopiée"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: [TCK-1889]
blocks: []
spec_refs:
  features:
    - "docs/features.md#27-médias--fichiers"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-195--seuils-de-saisie-recopiés-en-constantes-du-front-face-à-la-règle-de-lapi"
tags: [front, tests, parite, pistes]
---

## Objectif utilisateur

Une borne de l'API qui bouge sans la constante du front qui la recopie fait rougir un test, au lieu
qu'un écran laisse passer ce que l'API refuse ensuite en 422, ou refuse ce qu'elle accepte.

## Contexte

Réf : **P195.10** du fichier de pistes, `retenu · autonome` (A5 : test ajouté, sans seuil
resserré). Les écarts de P195.01 à P195.07 sont nés de constantes « mirrors the backend » que rien
ne comparait.

## Hypothèses (mode sans humain)

- Les deux côtés se lisent en texte (`readFileSync`), comme `search-filters.parity.test.ts` :
  `KycUploader`, `UpgradeRequestForm` et les deux composants de maintenance n'exportent pas leur
  constante, et les exporter pour le test élargirait le diff.
- Les paires sont celles que le mesureur a relevées égales (coût d'entrée, notes de favori, note
  vocale, pièce KYC des trois profils, statuts du surclassement), plus les deux bornes de cinq
  fichiers que TCK-1889 vient de faire appliquer au front (contestation, devis).

## Delta à produire

- [x] `takussan-web/src/lib/__tests__/seuils-de-saisie.parity.test.ts`.

## Critères d'acceptation

- [x] AC1 — Vert sur l'arbre : les neuf paires sont égales.
- [x] AC2 — Rouge si un côté bouge seul, en nommant la paire.
- [x] AC3 — Rouge si une constante ou une règle n'est plus trouvée (lecture qui ne lit rien).

## Reste à faire

- Déclencher `web-ci.yml` sur les fichiers PHP que le test lit (chemin `.github/`, fermé à
  l'implémenteur). Sans cela, une PR qui ne touche que l'API ne réveille pas la garde.

## Hors périmètre

- Les écarts encore ouverts de l'angle 195, renvoyés au porteur (P195.05, P195.07, P195.09).

## Notes d'implémentation

- Ablation : `UpdateFavoriteRequest::NOTES_MAX` passé à 501 et `MAX_BYTES` de `KycUploader` à
  9 Mo → 4 rouges (notes, et pièce KYC des trois profils) ; remis → 10 verts.
