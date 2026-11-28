---
id: TCK-3012
title: "Remplacer, ne pas empiler : la règle des tests écrite là où l'implémenteur la lit, et les comptes du CLAUDE.md pris à la source"
status: todo
phase: P2
family: technique
estimate: S
wave: 99
created: 2026-11-28
updated: 2026-11-28
depends_on: []
blocks: [TCK-3013, TCK-3014, TCK-3015, TCK-3016, TCK-3017, TCK-3018]
spec_refs:
  features: []
  models: []
tags: [technique, tests, back, architecture, adr-0140]
---

## Objectif utilisateur

L'agent qui livre un ticket range ses tests dans la classe du module qu'il éprouve et retire ceux que son module absorbe.

## Contrat de données

ADR-0140. Le relevé du 2026-11-28 (TSV par fichier : `/private/tmp/claude-501/-Users-aminethiam-Documents-perso-takussan/94f633e1-a1ae-4b22-af2b-442d465dff80/scratchpad/releve-tests/lot*.tsv`) : 1 738 fichiers de test ajoutés en 8 semaines, 22 retirés ; 2 095 fichiers sur 2 166 citent un ticket. Le `CLAUDE.md` racine annonce « ~380 fichiers · ~2 740 tests » ; mesuré : 2 165 fichiers, ~14 300 tests.

## Contraintes strictes (métier)

- La règle s'écrit dans les compétences que lit l'implémenteur, pas seulement dans l'ADR.
- Les comptes du `CLAUDE.md` se prennent par commande (pas de durée de suite qui ne vienne pas de la CI).


## Delta à produire

- [x] Compétences : `.agent/skills/implementing-specs/SKILL.md` et `.agent/skills/test-driven-development/SKILL.md` portent ADR-0140 (une classe par module, remplacer ne pas empiler, retrait prouvé par ablation)
- [x] `takussan-api/CLAUDE.md` : la règle en une section courte, avec le renvoi à ADR-0140
- [x] `CLAUDE.md` racine : le tableau « État courant » repris à la source (fichiers, tests, lignes), avec la commande qui le mesure

## Critères d'acceptation

- [x] AC1 — Les deux compétences et `takussan-api/CLAUDE.md` citent ADR-0140 et la règle d'ablation.
- [x] AC2 — Les chiffres du tableau d'état courant sont ceux que rendent les commandes citées à côté.

## Hors périmètre

- Le front (`takussan-web`) ; renommer les 1 391 méthodes `ac1_/m4_…` (aucun gain de détection ni de temps).

## Notes d'implémentation

Livré le 2026-11-28 par la session.

- Règle écrite dans `.agent/skills/implementing-specs/SKILL.md` (§ 11 bis), `.agent/skills/test-driven-development/SKILL.md`
  (« Good Tests » : une ligne « At the module's seam », et « Replace, don't stack ») et `takussan-api/CLAUDE.md`
  (§ Tests, « Une classe par module ; remplacer, ne pas empiler »), chacun renvoyant à ADR-0140.
- `CLAUDE.md` racine : tableau d'état repris à la source le 2026-11-28 (2 316 fichiers PHP, 249 300 lignes ; 925 routes ;
  313 contrôleurs ; 387 migrations ; 2 166 fichiers de test, 14 338 méthodes, 379 233 lignes ; front 4 411 fichiers, 185
  pages, 41 route handlers, 1 977 fichiers de test, ~13 000 cas), arrondi, avec les commandes. La référence de durée
  séquentielle (470-610 s, 2 740 tests) est marquée PÉRIMÉE plutôt que remplacée par un chiffre non mesuré.
- `takussan-api/CLAUDE.md` annonçait « 377 fichiers de test » au 2026-08-22 : corrigé.
