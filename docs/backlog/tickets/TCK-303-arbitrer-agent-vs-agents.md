---
id: TCK-303
title: "Deux répertoires de compétences concurrents, `.agent/` et `.agents/`, qui divergent en croix"
status: todo
phase: P1
family: technique
estimate: S
wave: 38
created: 2026-08-16
updated: 2026-08-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [outillage, agents, documentation, arbitrage, dette]
---

## Objectif utilisateur

Qu'un agent qui lit une compétence de ce dépôt lise la bonne — et qu'il n'existe plus deux réponses
opposées à la même question, chacune dans un répertoire que l'autre ignore.

## Contrat de données

Aucune donnée applicative. Mesuré le 2026-08-16 :

- `.agent/` — **646 fichiers** suivis par git. C'est celui que les outils chargent.
- `.agents/` — **602 fichiers** suivis par git. Personne ne le lit.
- `.agent/` porte en propre `AGENTS.md`, `INSTALL.md`, `agents/`, et sept compétences absentes de
  `.agents/` (`brainstorming`, `executing-plans`, `finishing-a-development-branch`,
  `receiving-code-review`, `requesting-code-review`, `single-flow-task-execution`…).
- `skills/implementing-specs/SKILL.md` **diffère entre les deux**.

**Et c'est un cas d'école : chacun a raison là où l'autre a tort.**

| Fichier | `.agent/` (chargé) | `.agents/` (mort) |
|---|---|---|
| `skills/implementing-specs/SKILL.md` | ❌ « Permissions use `spatie/laravel-permission` » | ✅ « résolues par `MembershipCapabilityResolver` (TCK-278, Règle 5) » |
| `skills/writing-specs/SKILL.md` | ✅ « `INDEX.md` is **GENERATED** » + champ `wave` requis | ❌ « Add a new bullet line », « `INDEX.md` is part of the deliverable » |

La bonne ligne sur le RBAC vit dans le répertoire mort ; la bonne ligne sur l'INDEX vit dans le
répertoire vivant. Quelqu'un a su, et a écrit juste — et la correction n'a jamais atteint le fichier
que les outils chargent.

## Contraintes strictes (métier)

- **Lister l'inventaire complet des divergences avant toute suppression.** Une suppression en bloc
  du répertoire mort perdrait la correction RBAC, qui n'existe que là. Le diff intégral se
  produit et se lit **avant** de décider quoi que ce soit.
- L'arbitrage porte sur le répertoire qui fait foi ; il ne dispense pas de **fusionner** ce que le
  perdant contient de juste.
- `.agent/skills/implementing-specs/SKILL.md` affirme aujourd'hui l'usage d'un package désinstallé,
  sur lequel une garde CI casse à l'import. C'est le schéma D-21 appliqué à l'outillage : une
  instruction qui décrit un mécanisme supprimé coûte plus qu'une instruction absente.

## Delta à produire

- [ ] Produire le diff intégral `.agent/` ↔ `.agents/` et l'inventorier fichier par fichier
- [ ] Pour chaque divergence, désigner la version juste — et écrire pourquoi
- [ ] Fusionner les corrections du répertoire perdant dans le gagnant
- [ ] Supprimer le répertoire perdant, en une opération séparée et lisible dans l'historique
- [ ] Corriger l'affirmation `spatie/laravel-permission` dans la compétence qui fait foi
- [ ] Garde CI : un second répertoire de compétences réintroduit fait échouer le build
- [ ] Prouver la garde **par mutation**

## Critères d'acceptation

- [ ] AC1 — un seul répertoire de compétences subsiste, et le dépôt dit lequel
- [ ] AC2 — aucune compétence survivante ne mentionne `spatie/laravel-permission` comme mécanisme
      d'autorisation en vigueur
- [ ] AC3 — l'inventaire des divergences est consigné, avec la décision prise sur chacune
- [ ] AC4 — recréer un second répertoire fait échouer la CI

## Hors périmètre

- Le contenu métier des compétences au-delà des divergences relevées.
- `.claude/commands/` et `.windsurf/workflows/`, qui sont deux voies équivalentes documentées et
  assumées.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
