---
id: TCK-2950
title: "CI du front — Vitest en 4 shards parallèles, le statique à côté, le check requis devient l'agrégateur"
status: todo
phase: P2
family: technique
estimate: S
wave: null
created: 2026-11-16
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, github, ci, front, vitest, adr-0063]
---

## Objectif utilisateur

- **Le porteur, qui livre** : le check requis du front rend son verdict en ~10 min au lieu de ~30.

## Contrat de données

Aucune donnée applicative. [ADR-0063](../../../adr/0063-attestation-de-ci-par-arbre.md) (attestation
par arbre), amendé le 2026-11-16 pour le front ; pendant côté API :
[TCK-637](../done/TCK-637-ci-parallele-couverture-decouplee.md).

Mesure de départ (2026-11-16, runs `web-ci.yml` 43921607586, 43916471402, 43915535384) : le job unique
`quality` dure ~30 min, dont **Vitest 18-26 min** (1 919 fichiers, 17 076 tests ;
`Duration 1575s (import 1520s, environment 1373s, tests 1260s)` sur un runner à 4 cœurs) — le coût est
la mise en place par fichier, pas les tests. ⚠ Le run 43921607586 est rouge (3 tests en échec), mais il
a joué la suite entière : sa durée vaut mesure.

## Contraintes strictes (métier)

- Le check requis de `preview`/`master` **`Front / Web (ESLint + tsc + Vitest + build)` garde son nom au
  caractère près** ; la protection de branche n'est pas modifiée.
- Un job requis dont une dépendance a échoué est *skipped*, et un *skipped* passe un check requis :
  l'agrégateur tourne sous `!cancelled()` et échoue explicitement sur tout autre résultat que
  « tout `success` », ou « tout sauté par une attestation trouvée ».
- L'attestation `ci-vert-web-<clé>` ne se dépose que si **tous** les shards et le job statique sont
  verts, par l'agrégateur seul ; jamais sur le chemin déjà attesté (la validité de 7 jours borne la dérive).
- `scripts/ci-attestation.mjs` n'est pas touché : il est dans la clé de l'API, et le modifier rejouerait
  les ~77 min de `API / couverture`.

## Delta à produire

- [ ] `web-ci.yml` : job `tests` en matrice `shard: [1, 2, 3, 4]`,
      `npx vitest run --shard=${{ matrix.shard }}/${{ strategy.job-total }}`, `fail-fast: false`.
- [ ] `web-ci.yml` : job `statique` — ESLint, `tsc --noEmit`, les `check:*`, build, poids des routes —
      en même temps que les shards (les deux ne dépendent que d'`attestation`).
- [ ] `web-ci.yml` : job `quality` (nom inchangé) = agrégateur, `needs: [attestation, statique, tests]`,
      `if: ${{ !cancelled() }}`, verdict explicite, puis dépôt de l'attestation.
- [ ] `scripts/check-ci-attestation.mjs` : forme du front tenue (jobs lourds sautés sur l'attestation et
      sans dépôt, matrice 1..N, agrégateur sous `!cancelled()` qui lit les deux `result` avant le dépôt,
      nom du check requis).
- [ ] Amendement d'ADR-0063 daté du 2026-11-16.

## Critères d'acceptation

- [ ] AC1 — Durée du check requis `Web (ESLint + tsc + Vitest + build)` (du premier job démarré au
      `completedAt` de l'agrégateur) relevée en CI : avant = les trois runs ci-dessus ; après = trois runs
      qui jouent réellement les shards (non sautés par l'attestation), avec la durée de chaque shard et
      du job statique — un shard nettement plus lourd que les autres se dit.
- [ ] AC2 — Ablation en CI : un test rendu rouge dans UN seul shard rend `quality` **rouge** (et non
      sauté), et la liste des artefacts du run ne contient **aucun** `ci-vert-web-*`.
- [ ] AC3 — Un arbre déjà attesté (push suivant qui ne change pas la clé `web`) : `statique` et les 4
      shards sont *skipped*, `quality` est **vert** et ne redépose pas d'artefact.

## Hors périmètre

- La protection de branche (`required_status_checks`) : inchangée, par construction.
- Un équilibrage des shards par durée mesurée : le découpage de Vitest (hachage des chemins) suffit tant
  qu'aucun shard ne dépasse nettement les autres.
- L'image du front (job `image`) : inchangée.

## Notes d'implémentation

_(à remplir par implementing-specs)_
