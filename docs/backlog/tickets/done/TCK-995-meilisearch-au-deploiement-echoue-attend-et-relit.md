---
id: TCK-995
title: "Meilisearch au déploiement : la synchronisation échoue vraiment, attend ses tâches, relit les réglages, et un index vide se réimporte"
status: done
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: [TCK-710]
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-52--réglages-meilisearch-réellement-appliqués-en-préproduction
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-53--index-meilisearch-testing_-et-smoke_-laissés-sur-linstance-docker-locale
tags: [api, search, deploy, meilisearch, dev, pistes, porteur]
---

## Contexte

Réfs : **P52.01, P52.02, P52.03, P52.04, P53.02, P53.03** du fichier de pistes. Décision du porteur
du 2026-10-19 : traitées hors agents, en session (le correctif vit dans `docker/release.sh`,
`dev.sh` et `deploy/`, chemins fermés à l'implémenteur).

- **P52.01** 🔴 — `scout:sync-index-settings` (Scout 11.3) attrape toute exception, l'imprime et
  sort en **0** : l'arrêt du déploiement posé par TCK-710 ne se déclenche jamais, et le premier
  refus abandonne aussi les index suivants (mesuré par le mesureur, `EXIT=0`).
- **P52.02** — la tâche Meilisearch rendue par la mise à jour des réglages n'est ni attendue ni
  lue, et rien ne relit les réglages appliqués ; « importé » veut dire « mis en file ».
- **P52.03** — une perte du volume `meili` n'est rattrapée par aucun déploiement : seul le marqueur
  du volume `storage` décide de l'importation.
- **P52.04** — les réglages partent en `PATCH` : un réglage retiré de `config/scout.php` garde son
  ancienne valeur dans un index déployé ; la valeur de `SCOUT_PREFIX` en préproduction n'est
  relevée nulle part.
- **P53.02** — `dev.sh` synchronise encore un préfixe `testing_` qu'aucun test ne lit, sous un
  commentaire faux.
- **P53.03** — `smoke-api.sh pile` laisse sa base et ses index `smoke_*`, et deux passages
  simultanés se détruiraient.

### Décisions du porteur

> P52.01 : une commande du dépôt qui sort en échec sur tout refus de Meilisearch, appelée par
> `release.sh` et `dev.sh`.
> P52.02 (avec P52.01) : tâches attendues, réglages relus et comparés à `config/scout.php`.
> P52.03 : compter les documents de l'index au `release` et forcer l'importation sur un index vide
> face à une table non vide, plutôt qu'une procédure du runbook.
> P52.04 (avec P52.02) ; relevé de `SCOUT_PREFIX` en préproduction.
> P53.02 : retirer la seconde synchronisation de `dev.sh` et son commentaire.
> P53.03 : base et index `smoke_*` retirés par `nettoyer_pile()`, et un verrou contre deux passages
> simultanés.

## Objectif utilisateur

Un déploiement qui laisse la recherche sur des réglages refusés, sur un index vide ou sur des
documents rejetés ne passe plus en silence : il s'arrête (réglages) ou se rattrape (documents).

## Contrat de données

Aucun endpoint. Deux commandes neuves :

- `search:sync-index-settings` — pour chaque index déclaré dans `config/scout.php` : envoie les
  réglages déclarés, plus `null` pour tout réglage que l'index porte et que la configuration ne
  déclare plus (Meilisearch le remet à son défaut) ; attend la tâche ; relit les réglages et les
  compare au déclaré. Un index en échec n'arrête pas les suivants ; la commande sort en 1 si un
  seul a échoué.
- `search:verify-indexes` — attend la file des index déclarés, puis `--documents` : échoue si un
  index est vide ou absent face à une table non vide ; `--depuis=<horodatage>` : échoue si une
  tâche de ces index a échoué depuis.

## Delta à produire

- [x] `app/Support/Search/ReglagesDIndex.php` : les réglages déclarés par index, ce qu'on envoie,
      et les écarts entre déclaré et relu.
- [x] `app/Console/Commands/SearchSyncIndexSettings.php` et `SearchVerifyIndexes.php`.
- [x] `docker/release.sh` : la commande du dépôt à la place de celle de Scout ; un index vide
      force l'importation malgré le marqueur ; le marqueur ne s'écrit que si les tâches
      d'importation ont réussi.
- [x] `scripts/test-release-reindex.sh` : les noms de commande, et les deux cas neufs.
- [x] `tests/Concerns/InteractsWithMeilisearch.php` : la suite synchronise par la même commande, et
      lève si elle échoue.
- [x] `dev.sh` : une seule synchronisation, par la commande du dépôt, sortie montrée en cas
      d'échec ; commentaire faux retiré.
- [x] `deploy/takussan/smoke-api.sh` : base et index `smoke_*` retirés au nettoyage ; verrou.
- [x] Documentation : `docs/configuration.md`, `docs/infra/hebergement.md` (perte de Meilisearch
      rattrapée ; `SCOUT_PREFIX` relevé).

## Critères d'acceptation

- [x] AC1 — Meilisearch injoignable : `search:sync-index-settings` sort en 1 et nomme chaque index ;
      la commande de Scout, dans le même cas, sort en 0 (le test le montre).
- [x] AC2 — un réglage refusé sur un index n'empêche pas les autres d'être synchronisés, et la
      commande sort en 1.
- [x] AC3 — un réglage que l'index porte et que la configuration ne déclare plus revient à son
      défaut après la synchronisation.
- [x] AC4 — une tâche rendue `failed`, ou des réglages relus qui diffèrent du déclaré, font sortir
      la commande en 1.
- [x] AC5 — `search:verify-indexes --documents` sort en 1 sur un index vide face à une table non
      vide, en 0 quand l'index est peuplé ou la table vide.
- [x] AC6 — `search:verify-indexes --depuis=…` sort en 1 sur une tâche échouée de ces index depuis
      l'horodatage, en 0 sinon.
- [x] AC7 — `release.sh` : réglages en échec → sortie 1, aucune importation ; marqueur à jour mais
      index vide → importation ; tâches d'importation échouées → marqueur non écrit.
- [x] AC8 — `smoke-api.sh pile` ne laisse ni la base `takussan_smoke` ni d'index `smoke_*`, et un
      second passage simultané est refusé.

## Hors périmètre

- Nommer dans `./dev.sh doctor` d'anciens index `testing_<modèle>` (P53.02, option non retenue).
- Le plan d'auto-hébergement du 2026-09-13, qui recopie l'ancien bloc de `release.sh`.

## Notes d'implémentation

- **Reproduction** : avant la commande, les 20 tests neufs rouges (classe et commandes absentes) ;
  le test d'AC1 garde le défaut de Scout en le jouant : `scout:sync-index-settings` sur un hôte
  injoignable sort en 0.
- **Mesuré sur Meilisearch 1.16 (7701) et 1.36 (7700)** : un `PATCH …/settings` qui porte `null`
  remet le réglage à son défaut ; un réglage mal formé est refusé tout de suite (400) ; `GET
  …/stats` d'un index absent rend 404.
- **Trouvé en relisant** : Meilisearch rend les mots en forme décomposée (le « à » des `stopWords`
  revient `a` + accent combinant). La première relecture signalait un écart sur `properties` ;
  la comparaison passe en NFC des deux côtés, avec son test.
- **La suite synchronise par la même commande** (`InteractsWithMeilisearch`), et lève si elle
  échoue : `tests/Feature/Search` et `tests/Unit/Search` → 282 verts (176 s, charge 4,05 sur 8).
- **Ablations**, chacune remise ensuite : statut de tâche ignoré → 1 rouge ; relecture ignorée →
  1 ; réglage retiré non remis à `null` → 1 ; échec non compté → 4 ; index vide toléré → 1 ;
  tâches échouées ignorées → 1. Dans `release.sh` : vérification des documents court-circuitée →
  2 rouges du harnais ; vérification des tâches court-circuitée → 1.
- **`SCOUT_PREFIX` de la préproduction** : `preview_`, relevé dans Dokploy et dans le conteneur
  `api` (2026-10-19).
- **Le test de la pile** (`smoke-api.sh pile`, images reconstruites avec ce code) : 15
  vérifications vertes, sortie 0, dont « release idempotent » (le second `release` lit les index
  peuplés par `search:verify-indexes --documents` et ne réimporte rien) et « release en échec :
  l'ancienne api sert toujours ». Après le passage : 0 index `smoke_*` sur 7701, pas de base
  `takussan_smoke`, verrou rendu. Verrou tenu par un processus vivant → le second passage sort en
  1 avant de poser son `trap`, sans rien nettoyer.
