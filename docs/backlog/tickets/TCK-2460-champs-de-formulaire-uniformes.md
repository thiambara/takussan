---
id: TCK-2460
title: "Une seule hauteur de champ, aucun contrôle natif de saisie, et une garde"
status: doing
phase: P1
family: technique
estimate: M
wave: 64
created: 2026-11-01
updated: 2026-11-01
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models: []
tags: [ui, design-system, formulaires, garde]
---

## Objectif utilisateur

Le porteur a remarqué que les champs (`input`, `select`, leurs tailles) n'étaient pas uniformes. Sur un même écran, un
champ, une liste déroulante, un sélecteur de date et un bouton ont désormais la même hauteur et le même retrait.

## Relevé du 2026-11-01

Sur 887 fichiers `.tsx` : `Input` à la hauteur de base 241 fois, `h-10` ×4, `h-11` ×1, `h-8` ×1 ; `SelectTrigger` de base
55 fois, `h-10` ×17, `h-9` ×8, `h-11` ×2, `h-8` ×1 ; environ 35 `<select>`, 22 `<input>` et 4 `<textarea>` natifs.
La racine en est la primitive : `h-8`, soit 29 px mesurés à 90 % de corps, trop bas pour un formulaire, et que chaque
écran rehaussait à sa façon.

## Décision

- Hauteur de base `h-10` dans `Input`, `SelectTrigger`, `DatePicker`, `DateTimePicker`, retrait `px-3`, `Textarea` au même
  retrait ; `SelectTrigger size="sm"` passe à `h-8`, seul compact.
- `Button` s'aligne : défaut `h-10`, `sm` `h-8`, `lg` `h-11`, icône `size-10`, sans quoi un bouton à côté d'un champ dépasse
  ou rentre.
- La portée `data-field-density="comfortable"` reste la seule à monter à `h-11` (site public, assistant, connexion).

## Critères d'acceptation

- [x] Les primitives portent `h-10` ; `field-density.test.tsx` fixe la valeur et l'ordre des règles compilées.
- [x] Hors de `components/ui/`, aucun `<Input>`, `<SelectTrigger>` ou `<Textarea>` n'écrit sa hauteur.
- [x] Hors de `components/ui/`, aucun `<select>`, `<textarea>` ni `<input>` de saisie natif.
- [x] `scripts/check-champs-uniformes.mjs` casse sur chacune de ces formes, vérifié par ablation, et `repo-ci` la rejoue
      (elle est ramassée par `scripts/check-*.mjs`).
- [x] `docs/design-guidelines.md` écrit la règle.
- [x] Mesuré au navigateur, à 1440 et 390 px : champs et listes du Radar à 36 px à 90 % de corps, aucun défilement du document.

## Écarts assumés

- Trois exceptions à compte figé dans la garde : deux pots de miel hors écran et la combobox de recherche, dont la coque porte le champ.
- `ProfileFilters` : champ et bouton restent à 44 px à la souris, au lieu de descendre à 40 px (TCK-573) ; la cible tactile n'y perd rien et les deux restent alignés.
- La conversion en `Select` change le geste de 29 listes natives : sur mobile, le menu de `@base-ui` remplace le sélecteur du système.
