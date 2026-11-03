---
id: TCK-1159
title: "Reseed d'une préproduction : le marqueur de recherche ne s'écrit qu'après relecture des tâches"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: [TCK-1157]
blocks: []
spec_refs:
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-89--commandes-de-releasesh-et-seedsh--code-de-sortie-et-conclusion-du-script"
tags: [back, release, search, pistes]
---

## Contexte

Réf : **P89.03** du fichier de pistes (🟠), `validé`.

`release.sh` relit les tâches d'importation (`search:verify-indexes --depuis`, TCK-995) avant
d'écrire le marqueur `.search-shape-importee`. `seed.sh` l'écrivait par un `cp` sans condition,
dès que les `scout:import` rendaient 0, c'est-à-dire dès que les documents étaient mis en file.
Le déploiement suivant trouvait alors le marqueur à jour sur un index peut-être partiel.

## Décision du porteur

> validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

**Choix de l'implémenteur.** La voie que la piste recommande : le bloc d'importation passe dans
une fonction de `lib.sh`, `importer_index <depuis>`, partagée par `release.sh` et `seed.sh`.

## Delta à produire

- [x] `lib.sh` : `importer_index` importe chaque modèle indexé, relit les tâches depuis
      l'horodatage donné, et n'écrit le marqueur que si tout a réussi ; rend 1 sinon.
- [x] `release.sh` l'appelle à la place de son bloc (même comportement, échec toléré).
- [x] `seed.sh` prend l'horodatage avant `scout:flush` (les tâches du flush sont relues aussi),
      appelle `importer_index`, et sort en 1 avec un message si elle échoue.
- [x] `scripts/test-release-reindex.sh` joue `seed.sh` avec Meilisearch ; l'ablation finale
      retire maintenant l'écriture du marqueur de `lib.sh`.

## Critères d'acceptation

- [x] AC1 — `seed.sh` importe les deux modèles indexés, joue `search:verify-indexes --depuis`, et
      écrit le marqueur.
- [x] AC2 — `search:verify-indexes --depuis` en échec, ou un `scout:import` en échec : marqueur
      absent.
- [x] AC3 — les 19 vérifications de `release.sh` et son ablation restent vertes.

## Hors périmètre

- Les documents orphelins qu'un `scout:flush` échoué laisse dans l'index : la réimportation
  suivante ne les retire pas (la piste les donne comme déduits, non mesurés).

## Notes d'implémentation

- Ablation : `seed.sh` rendu à son état précédent → 2 rouges (« relit les tâches », « marqueur
  absent sur tâches échouées ») ; remis → vert.
- Changement de sortie de `seed.sh` : une tâche d'indexation échouée le fait désormais sortir en 1
  (un `scout:import` en échec le faisait déjà, par `set -e`).
