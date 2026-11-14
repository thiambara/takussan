---
id: TCK-2737
title: "/sync-specs dit ce qu'on fait vraiment : la compétence sous .agent/skills/, le report du livré dans les specs, ni passe obligée ni push"
status: todo
phase: P2
family: technique
estimate: S
wave: null
created: 2026-11-11
updated: 2026-11-11
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [technique, outillage, agents, competences, specs, suivi-lot-1]
---

## Objectif utilisateur

L'agent qui lance `/sync-specs` à la fin d'un lot fait ce que le dépôt attend de lui : il reporte le livré dans
`docs/features.md` et `docs/models-spec.md`, commite en `docs(specs): …` sans pousser, et lance les gardes de docs.
Il ne suit plus une commande qui lui interdit précisément ce travail.

## Contexte

Mesuré pendant la passe du lot 1 de l'audit UX de /app (2026-11-11, PR #1667) :

- **La commande contredit la pratique.** `.claude/commands/sync-specs.md` interdit de modifier les deux specs.
  Elle impose une passe numérotée sous `docs/sync-passes/` (trois fichiers, un `INDEX.md`), puis un commit
  `chore(sync-specs): …` **et un push automatique**.
  - La pratique réelle de la convergence est l'édition directe des specs en `docs(specs): …` : 603e184eb,
    62c6090b8, c580d4916, et la passe du lot 1 (4af7dd63d, 1e47b67d3).
  - La dernière passe d'audit date du 2026-10-29 (pass-017, 5eee481e0).
  - Le team-lead a tranché le 2026-11-11 : « la pratique réelle (603e184eb) prime ».
- **Le push automatique viole le `CLAUDE.md` racine** : « Ne jamais merger ni pousser sans demande explicite ».
  La ligne `Co-Authored-By: Claude <noreply@anthropic.com>` de la commande n'est pas non plus la forme des
  commits du dépôt.
- **Aucune compétence sous `.agent/skills/`.** Le `CLAUDE.md` racine (§ Workflows) dit que les compétences vivent
  là, et que les commandes de `.claude/commands/` relaient vers `.agent/workflows/`, qui relaie vers `.agent/skills/`.
  Pour `sync-specs`, il n'existe ni `.agent/workflows/sync-specs.md` ni compétence. La commande porte tout le
  contenu, et c'est le motif que [J-08](../../../journal-des-corrections.md#j-08) décrit : un contenu hors du
  canonique absorbe les corrections.
- `scripts/check-skills-dir.mjs` ne le voit pas. Sa non-vacuité nomme en dur les deux compétences que les points
  d'entrée désignent (`implementing-specs`, `writing-specs`). Une commande qui ne relaie vers aucune compétence lui
  échappe.

## Décision

**Décidé par le team-lead le 2026-11-11 : (b), deux modes.** Il a déjà tranché sur le principe (pas de
passe 018 ; la pratique prime).

- **(a) Report du livré seul.** La passe d'audit disparaît, et `docs/sync-passes/` reste comme archive.
- **(b) Deux modes dans une compétence.**
  - **Report du livré**, par défaut. Il édite les specs d'après le code fusionné et les rapports de vérification.
  - **Passe d'audit**, sur demande. Elle écrit `docs/sync-passes/pass-NNN-…` sans toucher les specs. C'est le mode
    d'aujourd'hui, sans le push.

## Delta à produire

- [x] `.agent/skills/syncing-specs/SKILL.md` — la compétence, avec :
  - les sources : le code fusionné, les migrations du lot, `docs/spatie-query-builder.md`, les rapports de
    vérification et le journal du plan du lot ;
  - la méthode : le schéma migration par migration, puis le comportement, chaque affirmation relue dans le code
    avant d'entrer dans une spec ;
  - ce qui ne se tranche pas : un écart qui demande une décision va dans un ticket `todo` ou dans le rapport ;
  - les gardes : `node scripts/check-models-spec.mjs`, `node scripts/check-doc-links.mjs`,
    `node docs/gen-features-by-actor.mjs` puis `--check` ;
  - le commit : `docs(specs): …`, local, sans push sauf demande explicite ;
  - le mode passe d'audit, si l'option (b) est retenue
- [x] `.agent/workflows/sync-specs.md` — le relais, sur le modèle de `.agent/workflows/implement-spec.md`
- [x] `.claude/commands/sync-specs.md` — réduit au relais (une ligne, comme `implement-spec.md`)
- [x] `scripts/check-skills-dir.mjs` — `syncing-specs` dans la non-vacuité, avec les deux autres
- [x] `CLAUDE.md` racine, § Workflows : la ligne `/sync-specs` dit « reporte le livré dans … » (et la passe sur
      demande, si (b))

## Critères d'acceptation

- [x] AC1 — `.claude/commands/sync-specs.md` ne contient plus de consigne propre. Il relaie vers
      `.agent/workflows/sync-specs.md`, qui relaie vers `.agent/skills/syncing-specs/SKILL.md`.
- [x] AC2 — La compétence n'ordonne aucun push et n'interdit pas l'édition des specs en mode report.
- [x] AC3 — `node scripts/check-skills-dir.mjs` est vert.
- [x] AC4 — Ablation : renommer `.agent/skills/syncing-specs/` rougit la garde (non-vacuité).
- [x] AC5 — `node docs/backlog/gen-index.mjs --check`, `ranger-tickets.mjs --check` et `check-backlog.mjs` restent
      verts.

## Hors périmètre

- La réécriture des passes 001 à 017 : elles restent en archive
- Les autres commandes (`implement-spec`, `write-spec`), qui relaient déjà

## Notes d'implémentation

- **Prémisse re-mesurée au HEAD (745e3fa3f, 2026-11-14)** : `.claude/commands/sync-specs.md` portait toujours la
  passe numérotée, l'interdiction d'éditer les specs et le push automatique ; ni `.agent/workflows/sync-specs.md`
  ni `.agent/skills/syncing-specs/` n'existaient ; `EXIGEES` ne nommait que `implementing-specs` et `writing-specs`.
- **Option (b) retenue** (décision du team-lead) : mode « report du livré » par défaut, mode « passe d'audit » sur
  demande, qui reprend l'ancienne commande sans le push et sans la ligne `Co-Authored-By` en dur (le pied
  d'attribution est celui que la session prescrit).
- **Chaîne de relais** : la commande relaie vers `.agent/workflows/sync-specs.md`, qui relaie vers la compétence
  (AC1). `implement-spec.md` et `write-spec.md` relaient, eux, directement vers la compétence ; laissés tels quels
  (hors périmètre).
- **Preuves** :
  - AC1 : `.claude/commands/sync-specs.md` = frontmatter + une ligne de relais.
  - AC2 : la compétence ne contient aucune consigne de push ; elle dit « commit local, sans push » dans les deux
    modes, et le mode report édite les specs.
  - AC3 : `node scripts/check-skills-dir.mjs` → `✓ … 16 compétence(s)`. La garde lit `git ls-files` : tant que la
    compétence n'est pas indexée, elle est rouge en local ; mesurée verte sous un index temporaire
    (`GIT_INDEX_FILE`, copie de l'index), et le sera au commit.
  - AC4 : ablation, `.agent/skills/syncing-specs/` renommé en `syncing-specs-ABL` (index temporaire) → exit 1,
    « `.agent/skills/syncing-specs/SKILL.md` est introuvable » ; restauré → vert.
  - AC5 : `gen-index.mjs --check`, `ranger-tickets.mjs --check`, `check-backlog.mjs` → exit 0.
- Les autres gardes `scripts/check-*.mjs` rouges au moment de la mesure ne portent que sur
  `takussan-web/src/app/[locale]/(public)/playground/maquettes/` (hors ticket).
