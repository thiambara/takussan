---
id: TCK-2360
title: "Le cliquet de couverture de l'API passe de 86 à 92 %, sur un chiffre de CI (P12.05)"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [back, ci, tests, couverture, pistes]
---

## Objectif utilisateur

Le cliquet de couverture doit garder contre l'érosion. À 86 %, il laissait sept points de marge
sous la mesure réelle de la CI.

## Décision

Validation du porteur (2026-10-25), recopiée de P12.05 : « le cliquet de couverture passe à 92 % si l'artefact `couverture-api-clover` du dernier run nocturne de `dev` mesure au moins 92,5 % ; CLAUDE.md suit dans le même commit ».

## Mesure

Dernier run nocturne de `dev` : `api-ci.yml`, run 40074381064, 2026-10-24 07:30 Z, `69979ae96`, PCOV.
Commandes :

```
gh run download 40074381064 -n couverture-api-clover -D <dossier>
php takussan-api/bin/coverage-gate.php <dossier>/clover.xml --min=92.5
```

Sortie : « Total: 95.6 % (43037 / 45015 lignes exécutables) … ✓ cliquet tenu ». La condition
(au moins 92,5 %) est remplie.

## Delta

- [x] `.github/workflows/api-ci.yml` : `--min=92`, avec la mesure en commentaire.
- [x] `CLAUDE.md` (§ État courant et § commandes), dans le même commit.
- [x] `docs/journal-des-corrections.md` § J-02 : le resserrement et son chiffre.
- [x] Exemples d'usage dans `bin/coverage-gate.php` et `bin/build-impact-map.php`.

## Critères d'acceptation

- [x] AC1 — le seuil de la CI est 92, et CLAUDE.md dit 92 dans le même commit.
- [ ] AC2 — le premier `lint-and-test` de `dev` après la fusion évalue le cliquet à 92 et passe.

## Hors périmètre

- Les méthodes et les classes, que ce cliquet ne tient pas.
- Le front, qui n'a pas de cliquet de couverture.
