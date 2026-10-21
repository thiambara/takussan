---
id: TCK-1157
title: "Reseed d'une préproduction : rejouer alerts:ensure-ops-rules après db:seed"
status: done
phase: P2
family: bug
estimate: XS
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-89--commandes-de-releasesh-et-seedsh--code-de-sortie-et-conclusion-du-script"
tags: [back, release, alerts, pistes]
---

## Contexte

Réf : **P89.02** du fichier de pistes (🟠), `validé`.

`docker/seed.sh` joue `migrate:fresh` puis `db:seed`. Aucun seeder ne crée de ligne
`alert_rules` ; seule `alerts:ensure-ops-rules`, jouée par `release.sh` (TCK-768), les crée. Un
reseed de préproduction vidait donc la table jusqu'au push suivant sur `preview`.

## Décision du porteur

> validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

**Choix de l'implémenteur.** La piste offre deux voies : `seed.sh`, ou `DatabaseSeeder`. Retenue,
la plus étroite : **`seed.sh`**, que seul le reseed d'une préproduction (ou d'une base de fumée)
joue. `DatabaseSeeder` aurait aussi créé des règles d'alerte sur chaque base de développement.

## Delta à produire

- [x] `seed.sh` joue `alerts:ensure-ops-rules` après `db:seed` ; un échec avertit sans arrêter le
      reseed, comme dans `release.sh`.
- [x] `scripts/test-release-reindex.sh` joue `seed.sh` et vérifie l'appel et son ordre.

## Critères d'acceptation

- [x] AC1 — un passage de `seed.sh` (`DB_DATABASE=takussan_preview`) appelle `db:seed` puis
      `alerts:ensure-ops-rules`, dans cet ordre.
- [x] AC2 — `alerts:ensure-ops-rules` en échec : `seed.sh` sort en 0.

## Hors périmètre

- Les autres commandes de rattrapage de `release.sh` (`membership:reconcile-system-roles`,
  `geo:sync-referential`, `tags:sync-catalog`) : leurs données sont recréées par les seeders.

## Notes d'implémentation

- Ablation : `seed.sh` rendu à `HEAD` → AC1 rouge (« obtenu « db:seed » ») ; remis → vert. AC2
  reste vert sans le correctif (la commande n'est alors pas appelée) : il garde la tolérance, pas
  l'appel.
