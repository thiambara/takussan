---
id: TCK-637
title: "CI — la suite de l'API en `--parallel`, la couverture découplée de l'exécution qui juge les tests"
status: todo
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-13
updated: 2026-11-16
depends_on: [TCK-636]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, github, ci, couverture, adr-0063]
---

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : toujours vrai, et plus pressant qu'à la rédaction.** Aucun commit ne cite ce ticket ;
dépendance TCK-636 : done. `api-ci.yml:362-483` n'a toujours qu'un step séquentiel sous PCOV, puis
`bin/coverage-gate.php … --min=92` (l.483) ; aucune exécution `--parallel` en CI ; ADR-0063 §4 non amendé.

- **Seuil réel : 92 %** (resserré de 86 à 92 % le 2026-10-25, TCK-2360, commit `243320aac`).
- **Durée actuelle du job `lint-and-test`** (3 dernières PR vertes, `gh run view <id> --json jobs`) :
  **89 min 53 s** (run 43799491209, 2026-11-16), **79 min 34 s** (43734501786, 2026-11-15),
  **54 min 15 s** (43674090498, 2026-11-15) — contre 17-23 min annoncées par ADR-0063.
- `cov.php` n'est produit que sur `schedule`/`workflow_dispatch` sur `dev` (`api-ci.yml:429-434`) :
  la PR vers `dev` n'en a pas besoin, ce qui simplifie le découplage côté PR.

**Reste à faire** : les deux mesures en CI, le choix et l'amendement d'ADR-0063 §4, le cliquet
92 % sur clover complet, AC1 avant/après, AC2 par ablation. Si la couverture passe dans un job à
part, l'ajouter aux checks requis de `preview`/`master` et à `promotion-ci.yml`.

**Décision attendue du porteur** (amendement d'ADR-0063) : (a) deux jobs — tests parallèles qui
jugent et attestent, couverture séquentielle à côté —, (b) couverture fusionnée par `phpcov merge`,
(c) couverture sortie de la PR (nuit sur `dev`) ?

## Objectif utilisateur

- **Le porteur, qui livre** : la seule exécution complète qui reste après TCK-636 — la PR vers
  `dev` — prend moins de temps.

## Contrat de données

Aucune donnée applicative. [ADR-0063](../../../adr/0063-attestation-de-ci-par-arbre.md) §4 et
[J-12](../../../journal-des-corrections.md#j-12) : `--parallel` est validé en local (TCK-321, TCK-322,
TCK-334), son gain en CI est mesuré à ×2,48 (à re-mesurer : la suite a grossi — relevé 2026-11-16), mais une seule exécution porte les tests **et** la
couverture, et PCOV agrège mal entre processus.

Mesure du 2026-11-16 : `lint-and-test` dure **54 à 90 min** par PR (contre 17-23 min dans
ADR-0063) — ce ticket est le principal levier du temps de livraison.

## Contraintes strictes (métier)

- Le cliquet de couverture (~~86 %~~ **92 %**, `bin/coverage-gate.php --min=92`, resserré le
  2026-10-25 par TCK-2360, commit `243320aac`) reste évalué sur chaque PR vers `dev`,
  sur un clover complet — ou l'ADR qui le déplace dit où et pourquoi.
- La carte d'impact (nuit, ADR-0063 §3) garde son `cov.php` à attribution test → lignes. *(Relevé
  2026-11-16 : `cov.php` n'est produit que sur `schedule`/`workflow_dispatch` sur `dev`,
  `api-ci.yml:429-434`.)*

## Delta à produire

- [ ] Mesurer en CI : suite `--parallel` sans couverture, et couverture seule, sur le même arbre.
- [ ] Choisir entre deux jobs (tests parallèles + couverture séquentielle en parallèle d'eux) et
      une couverture fusionnée (`phpcov merge`) ; écrire la décision en amendement d'ADR-0063.
- [ ] Le job qui dépose l'attestation (TCK-636) reste celui qui juge les tests.

## Critères d'acceptation

- [ ] AC1 — Durée du check requis « API / lint-and-test » sur une PR vers `dev` relevée avant et
      après, sur trois exécutions chacune.
- [ ] AC2 — Le cliquet rougit toujours par ablation (une ligne couverte retirée sous le seuil).

## Hors périmètre

- Le front : sa suite ne porte pas de couverture.
