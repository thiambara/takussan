---
id: TCK-469
title: "Changer le type d'un bien laisse en base des valeurs que le nouveau type ne justifie plus"
status: done
phase: P1
family: full
estimate: M
wave: 52
created: 2026-08-29
updated: 2026-08-30
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

- [x] Trancher le sort d'une valeur devenue non pertinente, et l'écrire.
- [x] Appliquer la décision au chemin d'édition sans altérer le chemin de création.
- [x] Tests : le comportement retenu est prouvé par ablation, des deux côtés.

## Critères d'acceptation

- [x] AC1 — éditer un appartement portant `bedrooms: 3` pour en faire un terrain produit l'état
      décidé, et un test échouerait si le comportement changeait.
- [x] AC2 — la création reste inchangée : aucune clé non pertinente n'est envoyée, et aucune n'est
      envoyée à `null` par erreur.
- [x] AC3 — une mise à jour partielle n'écrase jamais un champ que l'utilisateur n'a pas touché.

## Hors périmètre

- Toute reprise rétroactive des biens déjà en base portant de telles valeurs.

## Notes d'implémentation

Relevé par la revue de la tâche 10 de TCK-464. Le raisonnement pour le laisser hors périmètre à ce
moment-là — l'étendre touchait `sanitizeByType`, dont le contrat venait d'être validé côté création
— a été jugé solide par la revue elle-même.

## Ablation côté front — jouée le 2026-08-30

Le lot annonçait la preuve « des deux côtés » sans l'avoir jouée côté front : l'API portait la
sienne (`PropertyEffacementParTypeTest`), le front non. Trois démontages, chacun appliqué puis
vérifié par empreinte du fichier **avant** de lire le résultat — `git diff --numstat` ne distingue
pas une substitution à nombre de lignes égal.

Référence : `field-matrix.ts` md5 `93f9fb3a…`, `payload.ts` md5 `da86adbe…`, **37/37 verts**.

| # | Ce qui est démonté | md5 obtenu | Rouges | Ce que les rouges nomment |
|---|---|---|---|---|
| A | la branche `erase` de `sanitizeByType` (retour au `delete` d'avant le ticket) | `30c6a2f1…` | **4 / 37** | `bedrooms: null` à la bascule, `furnished` par `false`, la substitution, la colonne NOT NULL |
| B | `toCreatePayload` passe `'erase'` au lieu de `'omit'` | `709e2cd1…` | **3 / 37** | AC4 de TCK-464, la purge d'un terrain, « n'émet aucune valeur `null` dans le corps » |
| C | en mode `erase`, la boucle visite **toutes** les clés conditionnelles au lieu des seules clés présentes | `9a8d9968…` | **2 / 37** | les deux tests d'AC3, mot pour mot |

Restauration vérifiée : les deux empreintes de référence retrouvées, **37/37**.

**Ce que A et B prouvent ensemble, et qu'aucun des deux ne prouve seul** : le contrat n'est pas
« effacer », c'est *effacer à l'édition et omettre à la création*. Un correctif qui aurait effacé
partout serait passé sous A. B est le test qui l'attrape — et c'est la contrainte que le ticket
posait en premier (« ne pas le casser en corrigeant l'édition »).

C garde l'invariant partagé par les deux modes, celui dont dépend le `PATCH` partiel : une clé
absente de l'entrée reste absente de la sortie. *Une fonction qui efface bien peut effacer trop* —
sans C, un `sanitizeByType` qui aurait émis les onze clés conditionnelles à `null` serait passé
vert sous A comme sous B.
