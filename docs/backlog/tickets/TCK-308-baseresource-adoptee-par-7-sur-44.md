---
id: TCK-308
title: "`BaseResource` adoptée par 7 ressources sur 44 — 37 refont les conversions à la main"
status: todo
phase: P2
family: technique
estimate: M
wave: 39
created: 2026-08-16
updated: 2026-08-16
depends_on: [TCK-279]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [back, api, resource, convention, refactor, dette]
---

## Objectif utilisateur

Qu'une date, un montant ou un booléen se sérialisent de la même façon sur toute l'API — pour que le
front n'ait pas à connaître, endpoint par endpoint, quelle conversion a été refaite à la main.

## Contrat de données

Aucun modèle nouveau. Mesuré le 2026-08-16 : **7 ressources sur 44** étendent `BaseResource` sous
`app/Http/Resources/`. Les 37 autres refont les conversions à la main. *(Chiffre identique à celui
de l'ardoise D-36 du 2026-08-12 : cette dette n'a ni grossi ni fondu.)*

`BaseResource` existe depuis TCK-048 (`done`), et `takussan-api/CLAUDE.md` tranche pour le code neuf.

## Contraintes strictes (métier)

- **Le montant est décimal en base, entier ×100 à la frontière du driver de paiement** (principe
  n°3). XOF n'a pas de sous-unité. Toute ressource qui expose un montant et qui migre vers
  `BaseResource` doit conserver **exactement** la représentation qu'elle émettait — c'est la
  conversion la plus facile à casser sans qu'un test s'en aperçoive.
- Le front consomme ces formes. Un changement de sérialisation est une rupture de contrat : chaque
  ressource migrée est vérifiée contre ses appelants front avant d'être fusionnée.
- **Ne pas migrer 37 ressources en un commit.** Découper par domaine, tests verts à chaque étape.
- Convergence sans garde = dette qui revient.

## Delta à produire

- [ ] Inventorier les 37 ressources et les conversions qu'elles refont, en marquant celles qui
      exposent un montant
- [ ] Vérifier, ressource par ressource, que la forme émise est couverte par un test avant migration
- [ ] Migrer par domaine vers `BaseResource`, tests verts à chaque étape
- [ ] Vérifier chaque migration contre les appelants front
- [ ] Garde CI : une ressource qui n'étend pas `BaseResource` fait échouer le build
- [ ] Prouver la garde **par mutation**

## Critères d'acceptation

- [ ] AC1 — les 44 ressources étendent `BaseResource`, ou l'exception est documentée avec sa raison
- [ ] AC2 — aucun montant exposé par l'API n'a changé de représentation — vérifié par un test qui
      compare la sortie avant et après sur chaque ressource concernée
- [ ] AC3 — la suite backend reste verte, sans assertion assouplie
- [ ] AC4 — la suite frontend reste verte
- [ ] AC5 — ajouter une ressource qui n'étend pas `BaseResource` fait échouer la CI

## Hors périmètre

- L'enveloppe de pagination — TCK-304.
- Les libellés affichés, qui appartiennent au front (principe n°5).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
