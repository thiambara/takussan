---
id: TCK-469
title: "Changer le type d'un bien laisse en base des valeurs que le nouveau type ne justifie plus"
status: todo
phase: P1
family: full
estimate: M
wave: 52
created: 2026-08-29
updated: 2026-08-29
depends_on: [TCK-464]
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
  models:
    - docs/models-spec.md#3-property
tags: [front, back, properties, donnees, bug]
---

## Objectif utilisateur

Un bien dont on a changé le type ne conserve pas, invisible en base, un nombre de chambres qui ne
veut plus rien dire.

## Contrat de données

`takussan-web/src/components/property-form/field-matrix.ts` répond à « ce champ existe-t-il pour ce
couple *(type, contrat)* ? ». `sanitizeByType` **omet** du payload les clés devenues non
pertinentes — elle ne les met pas à `null`.

## Contraintes strictes (métier)

- À la **création**, omettre est le bon contrat, et il est éprouvé : on n'envoie pas ce qu'on n'a
  pas. Ne pas le casser en corrigeant l'édition.
- À l'**édition**, un appartement basculé en terrain fait disparaître `bedrooms` de l'écran, mais la
  valeur reste en base **sans plus aucune affordance pour la corriger depuis cet écran**. C'est une
  régression d'usage introduite par le fait de masquer des champs auparavant toujours visibles.
- ⚠ La décision porte sur la **donnée**, pas sur l'affichage : faut-il effacer la valeur devenue
  sans objet, ou la conserver au cas où l'utilisateur reviendrait au type précédent ? Trancher
  explicitement, et écrire le pourquoi — les deux réponses se défendent, et c'est celle qu'on ne
  documente pas qui coûtera.
- `sanitizeByType` est **partagée** entre création et édition : toute évolution se juge des deux
  côtés.

## Delta à produire

- [ ] Trancher le sort d'une valeur devenue non pertinente, et l'écrire.
- [ ] Appliquer la décision au chemin d'édition sans altérer le chemin de création.
- [ ] Tests : le comportement retenu est prouvé par ablation, des deux côtés.

## Critères d'acceptation

- [ ] AC1 — éditer un appartement portant `bedrooms: 3` pour en faire un terrain produit l'état
      décidé, et un test échouerait si le comportement changeait.
- [ ] AC2 — la création reste inchangée : aucune clé non pertinente n'est envoyée, et aucune n'est
      envoyée à `null` par erreur.
- [ ] AC3 — une mise à jour partielle n'écrase jamais un champ que l'utilisateur n'a pas touché.

## Hors périmètre

- Toute reprise rétroactive des biens déjà en base portant de telles valeurs.

## Notes d'implémentation

Relevé par la revue de la tâche 10 de TCK-464. Le raisonnement pour le laisser hors périmètre à ce
moment-là — l'étendre touchait `sanitizeByType`, dont le contrat venait d'être validé côté création
— a été jugé solide par la revue elle-même.
