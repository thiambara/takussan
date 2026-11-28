---
id: TCK-3003
title: "Un seul lecteur des tickets du backlog : gen-index, check-backlog et ranger-tickets lisent par docs/backlog/tickets.mjs"
status: done
phase: P2
family: technique
estimate: S
wave: 99
created: 2026-11-27
updated: 2026-11-28
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

- [x] Module : `docs/backlog/tickets.mjs` — `STATUTS`, `listerTickets(racine)`, `lireFrontmatter(texte)` (toutes les formes : scalaire, `[]` inline, liste en bloc, `null` sur une clé vide hors listes, sous-clés inline et en bloc de `spec_refs` → `_spec_paths`), `lireTickets(racine)` qui rend des objets normalisés
- [x] `gen-index.mjs`, `check-backlog.mjs`, `ranger-tickets.mjs` : n'utilisent plus que ce module pour lister et lire
- [x] Tests : `docs/backlog/__tests__/tickets.test.mjs` (`node:test`), frontmatters fabriqués couvrant chaque forme, dont la liste en bloc et `wave:` vide
- [x] CI : `repo-ci.yml` joue `node --test docs/backlog/__tests__/` (et ses `paths` couvrent `docs/backlog/**`)

## Critères d'acceptation

- [x] AC1 — `grep -c "function frontmatter" docs/backlog/*.mjs` ne rend plus qu'un fichier, `tickets.mjs`.
- [x] AC2 — Un ticket fabriqué avec `depends_on:` en liste en bloc est lu avec ses dépendances par les trois outils (test qui échoue sur l'ancien `gen-index`).
- [x] AC3 — Les cinq sorties listées en contrainte sont identiques avant et après (diff vide).
- [x] AC4 — `node --test docs/backlog/__tests__/` est vert et joué par `repo-ci`.

## Hors périmètre

- Le contenu de l'index généré, les règles de cohérence de `check-backlog`.

## Notes d'implémentation

Relevé et livré le 2026-11-27 (branche `feat/approfondissements-architecture`).

- **Les trois divergences re-mesurées** avant d'écrire : l'ancien `frontmatter` de `gen-index`
  (extrait de `HEAD`) rend `depends_on: []` sur une liste en bloc, celui de `check-backlog`
  `["TCK-9102"]` sur le même texte. Le module reprend le parseur de `check-backlog` (le
  sur-ensemble) ; `gen-index` gagne donc les listes en bloc, qu'il ne rend nulle part — d'où un
  index identique.
- **Le listage n'était pas le même** : `gen-index`/`check-backlog` prenaient tout `.md` hors `_*`,
  `ranger-tickets` les seuls noms `TCK-N-slug.md`. `listerTickets` liste LARGE (sinon le
  « ne commence pas par son id » de `check-backlog` ne verrait plus un fichier mal nommé) ;
  `ranger-tickets` resserre lui-même. Testé par un fichier `mal-nomme.md` fabriqué.
- **Doublons d'id** : `gen-index` gardait les deux, `check-backlog` le dernier. `lireTickets` rend
  les deux, avec l'erreur ; chaque outil garde son choix.
- **Normalisation** : `lireTickets` rend `depends_on`, `blocks`, `tags`, `_spec_paths` toujours en
  tableau, et un scalaire (`depends_on: TCK-12`) en liste d'un élément — il devenait une chaîne que
  toutes les vérifications de dépendances traversaient en silence. Aucun ticket de l'arbre n'a
  cette forme (mesuré), d'où des sorties inchangées. Les gardes `Array.isArray` de `check-backlog`
  sont tombées avec.
- **Export de `ranger-tickets`** : `git grep` ne trouve AUCUN importeur de `listerTickets` ni de
  `STATUTS` (ni `check-doc-links`, ni `check-pistes`) : le ré-export est retiré (aucun appelant).
- **AC1, écart de libellé** : le Delta nomme la fonction `lireFrontmatter`, que le grep littéral
  `function frontmatter` ne trouve pas — il rend 0 partout. Mesuré avec l'intention de l'AC :
  `grep -cE "function (lireF|f)rontmatter" docs/backlog/*.mjs` → 1 dans `tickets.mjs`, 0 ailleurs.
  Le test « les trois outils ne lisent que par ce module » le garde (ni parseur, ni `readdirSync`).
- **AC3** : les cinq sorties capturées avant toute modification puis après, `INDEX.md` généré
  compris — `diff -r` vide (2337 tickets).
- **AC4, piège Node 24** : `node --test docs/backlog/__tests__/` (la forme du ticket) prend le
  dossier pour un fichier, `pass 0 / fail 1`. CI et commande : `node --test
  'docs/backlog/__tests__/*.test.mjs'` → 17 tests verts. `check-gardes-branchees` vert.
- **`scripts/check-pistes.mjs` (`GARDES`)** nommait `docs/backlog/(gen-index|check-backlog).mjs`
  comme gardes que l'implémenteur des pistes ne modifie pas ; `tickets.mjs` porte désormais leur
  lecture et y entre (la session).

