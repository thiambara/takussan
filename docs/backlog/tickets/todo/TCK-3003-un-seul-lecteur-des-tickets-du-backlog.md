---
id: TCK-3003
title: "Un seul lecteur des tickets du backlog : gen-index, check-backlog et ranger-tickets lisent par docs/backlog/tickets.mjs"
status: todo
phase: P2
family: technique
estimate: S
wave: 99
created: 2026-11-27
updated: 2026-11-27
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [technique, backlog, outillage, architecture]
---

## Objectif utilisateur

Le porteur et les agents écrivent un ticket dans n'importe quelle forme YAML admise, et les trois outils du backlog le lisent de la même façon.

## Contrat de données

Le format est celui de `docs/backlog/_template.md`. Lecteurs actuels (relevé du 2026-11-27 sur `dev` 4e3a929f7) :

- `docs/backlog/gen-index.mjs:60-126` : parseur de frontmatter n° 1 (67 lignes), `STATUTS` (objet) ;
- `docs/backlog/check-backlog.mjs:58-113` : parseur n° 2 (56 lignes), `STATUTS` (tableau) ;
- `docs/backlog/ranger-tickets.mjs` : `statutDe` (une regex sur `status:`), `listerTickets`, `STATUTS` exporté.

Les deux parseurs ont divergé deux fois (`wave:` vide ; sous-clé inline de `spec_refs`, 26 tickets sur 270 non vérifiés). Une troisième divergence est encore ouverte : dans `gen-index`, une liste écrite en bloc (`depends_on:` puis `  - TCK-…`) reste vide, alors que `check-backlog` la remplit.

## Contraintes strictes (métier)

- Aucune dépendance npm neuve (le dépôt n'a pas de dépendance YAML à la racine, et ne doit pas en gagner).
- Les sorties de `gen-index.mjs`, `gen-index.mjs --check`, `check-backlog.mjs`, `check-backlog.mjs --report` et `ranger-tickets.mjs --check` sont identiques avant et après sur l'arbre actuel.
- `ranger-tickets.mjs` reste exécutable comme script et garde son export `listerTickets` (lu par `scripts/check-doc-links.mjs` / `scripts/check-pistes.mjs` s'ils l'importent).

## Delta à produire

- [ ] Module : `docs/backlog/tickets.mjs` — `STATUTS`, `listerTickets(racine)`, `lireFrontmatter(texte)` (toutes les formes : scalaire, `[]` inline, liste en bloc, `null` sur une clé vide hors listes, sous-clés inline et en bloc de `spec_refs` → `_spec_paths`), `lireTickets(racine)` qui rend des objets normalisés
- [ ] `gen-index.mjs`, `check-backlog.mjs`, `ranger-tickets.mjs` : n'utilisent plus que ce module pour lister et lire
- [ ] Tests : `docs/backlog/__tests__/tickets.test.mjs` (`node:test`), frontmatters fabriqués couvrant chaque forme, dont la liste en bloc et `wave:` vide
- [ ] CI : `repo-ci.yml` joue `node --test docs/backlog/__tests__/` (et ses `paths` couvrent `docs/backlog/**`)

## Critères d'acceptation

- [ ] AC1 — `grep -c "function frontmatter" docs/backlog/*.mjs` ne rend plus qu'un fichier, `tickets.mjs`.
- [ ] AC2 — Un ticket fabriqué avec `depends_on:` en liste en bloc est lu avec ses dépendances par les trois outils (test qui échoue sur l'ancien `gen-index`).
- [ ] AC3 — Les cinq sorties listées en contrainte sont identiques avant et après (diff vide).
- [ ] AC4 — `node --test docs/backlog/__tests__/` est vert et joué par `repo-ci`.

## Hors périmètre

- Le contenu de l'index généré, les règles de cohérence de `check-backlog`.

## Notes d'implémentation
