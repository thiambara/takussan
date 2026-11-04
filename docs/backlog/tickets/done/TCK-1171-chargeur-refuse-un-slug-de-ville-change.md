---
id: TCK-1171
title: "Le chargeur du référentiel refuse une ville dont le jeu a changé le slug"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: [TCK-1155]
blocks: []
spec_refs:
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-99--critères-de-ville-et-de-région-rangés-par-nom-face-au-chargeur-du-référentiel"
tags: [back, geo, pistes]
---

## Contexte

Réf : **P99.04** du fichier de pistes (🟠), `validé`.

L'extraction calcule le slug d'une ville depuis son nom OSM. Quand le nom change en amont, le
slug change, et le chargeur, qui retrouve une ville par son slug puis par son nom, en créait une
seconde : l'ancienne gardait les adresses, et ses quartiers existaient deux fois.

## Décision du porteur

> validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

**Choix de l'implémenteur.** La piste propose deux lieux de refus, le chargeur ou `signer.mjs`,
et décrit sa garde comme un test du chargeur (« refus nommé, base inchangée »). Retenu, **le
chargeur** : c'est la voie dont la piste écrit la garde, et la plus étroite — `signer.mjs` devrait
comparer au jeu précédent, ce qu'aucun outil ne fait. Le refus n'arrête pas une mise en service :
`release.sh` tolère l'échec de `geo:sync-referential`, et la région refusée reste à sa version
précédente (TCK-1155).

## Delta à produire

- [x] `GeoReferentialLoader::refuserUnSlugDeVilleChange()`, appelée au début de chaque région,
      dans sa transaction : une ville connue de la région absente du jeu (ni par slug, ni par nom
      replié) dont une ville neuve reprend des quartiers (même slug) lève une `RuntimeException`
      qui nomme les deux villes, leurs slugs et les quartiers communs.
- [x] Test `test_une_ville_dont_le_jeu_change_le_slug_est_refusee`.

## Critères d'acceptation

- [x] AC1 — jeu v1 chargé, bien à Guédiawaye ; jeu où la ville devient « Ndiarème Limamoulaye »
      (`ndiareme-limamoulaye`) : la commande échoue en nommant le nouveau slug ; nombre de villes
      et de quartiers inchangé, adresse toujours rattachée à « Guédiawaye ».
- [x] AC2 — les chargements existants (jeu v1 et v2, 14 régions versionnées) passent.

## Reste à faire

- Un quartier dont le jeu change le slug dans une ville connue crée encore un second quartier :
  la condition de la piste (« une ville neuve porte les mêmes quartiers ») ne le couvre pas.

## Notes d'implémentation

- Ablation : appel retiré → le test rougit (la commande sort en 0) ; remis → 10/10 dans la
  classe, 11/11 dans `GeoReferentialSeederTest`.
