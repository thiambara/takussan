---
id: TCK-2857
title: "Tâches : l'aide du balayage au téléphone ; « Grouper par » et « Rattachée à », « Plus tard » en tableau avec « Reporter · Modifier » au bureau ; « Nouvelle tâche » préremplie depuis la fiche d'un client ou d'un bien, avec « Annuler »"
status: todo
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#32-task-"
tags: [front, taches, agent, audit-ux, app]
---

## Objectif utilisateur

L'agent découvre le geste de balayage, retrouve les tâches d'un client ou d'un bien, agit sur une tâche lointaine sans l'ouvrir, et crée une tâche depuis une fiche sans ressaisir à qui elle se rattache.

## Contrat de données

Aucun endpoint neuf (vérifié le 2026-11-15) :

- `GET /api/tasks` filtre déjà par `filter[taskable_type]` et `filter[taskable_id]` : `TaskController::index` passe par `Task::buildQuery` (`HasQueryBuilder`), qui applique `Task::$requestFilterable` — la valeur de `taskable_type` est le type morph stocké (`TaskController::store` l'emploie tel quel). TCK-2596 l'avait écarté « sans filtre servi par l'API », à tort.
- Reporter et modifier : `PATCH /api/tasks/{task}` (existe).
- `NouvelleTache` accepte déjà une prop `rattachement` (`components/taches/NouvelleTache.tsx:29-33`) : **aucun appelant ne la passe** (seul appelant : `PageDesTaches.tsx:287`).

Relevé : audit-f3-coque.md, app-aujourdhui e1 et e2 ; écarts de TCK-2596 (aide « Balayer » rangée en « donnée » alors que c'est un libellé fixe ; « Plus tard » jamais relevé).

## Direction UX / Artistique

**Référence de fidélité** — `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-aujourdhui.tsx`, approche a :

- **e1 « Toutes les tâches »**, **téléphone** : sous les pastilles, l'aide « Balayer à droite : fait. À gauche : reporter (demain, lundi, choisir). » (l. 503).
- **e1**, **bureau** : dans la tête de page, les filtres **« Grouper par : Échéance »** et **« Rattachée à : Tout »** (l. 726-727 : la maquette ne montre que la valeur choisie ; les options — Échéance · Rattachement pour l'un, Tout · Clients · Biens pour l'autre — sont une **proposition de ce ticket**, à confirmer par le porteur sur la PR) ; **« Plus tard »** en **tableau** (titre · rattachement · échéance) avec, par ligne, **« Reporter · Modifier »** en ligne (l. 739-752).
- **e2 « Nouvelle tâche »**, **les deux formats** : ouverte depuis la fiche d'un client (ou d'un bien), « Rattachée à » est prérempli (« Mariama Fall » / « Cliente · préremplie depuis sa fiche », l. 560-565) ; **bureau** : « Annuler » à côté de « Créer la tâche » dans le pied du panneau (l. 795).

## Contraintes strictes (métier)

- L'aide du balayage disparaît après le premier balayage réussi (préférence locale) ou reste — suivre la maquette, qui la montre toujours ; noter le choix.
- Les filtres se reflètent dans l'URL (`?grouper=…&rattachement=…`) et se combinent avec les pastilles.
- « Reporter » en ligne propose Demain · Lundi · Dans une semaine · Choisir…, comme la fiche ; « Modifier » ouvre la fiche en édition.
- La fiche du client et la fiche du bien gagnent une entrée « Nouvelle tâche » (là où leurs maquettes ou leurs actions la placent) qui passe le rattachement.
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel ; vouvoiement.

## Delta à produire

- [ ] Aide du balayage (téléphone).
- [ ] « Grouper par » et « Rattachée à » (bureau).
- [ ] « Plus tard » en tableau avec actions en ligne (bureau).
- [ ] « Nouvelle tâche » depuis la fiche du client et du bien, préremplie ; « Annuler » au pied (bureau).
- [ ] Tests : aide rendue à 390 ; `filter[taskable_type]` envoyé pour « Clients » ; regroupement par rattachement ; « Reporter » en ligne → `PATCH` avec la nouvelle échéance ; ouverture depuis une fiche client → « Rattachée à » vaut ce client.

## Critères d'acceptation

- [ ] AC1 — À 390 sur `/app/tasks`, le texte « Balayer à droite : fait. À gauche : reporter (demain, lundi, choisir). » est rendu.
- [ ] AC2 — (options proposées, cf. Direction) À 1440, « Rattachée à : Clients » ne rend que des tâches rattachées à un client (requête avec `filter[taskable_type]`) ; « Grouper par : Rattachement » regroupe par client/bien.
- [ ] AC3 — À 1440, « Plus tard » est un `table` dont chaque ligne porte « Reporter » et « Modifier » ; « Reporter › Demain » met l'échéance à demain sans ouvrir la fiche.
- [ ] AC4 — Depuis la fiche de Mariama Fall, « Nouvelle tâche » ouvre le formulaire avec « Mariama Fall » rattachée ; « Créer la tâche » crée une tâche dont `taskable` est sa fiche.
- [ ] AC5 — Au bureau, le pied du panneau porte « Annuler », qui ferme sans créer.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2857.json` : app-aujourdhui e1 et e2 (e2 relevé avec un titre saisi et un client prérempli), téléphone et bureau.
- [ ] AC-F2 — Zéro écart non expliqué ; ni l'aide, ni les filtres, ni « Plus tard » ne sont rangés en « donnée » ou `hors_perimetre`.
- [ ] AC-F3 — À 1024 et 768 : `scrollWidth − innerWidth = 0` ; le tableau « Plus tard » défile dans son conteneur.

## Hors périmètre

- Ma journée : TCK-2856.

## Notes d'implémentation

_(à remplir par implementing-specs)_
